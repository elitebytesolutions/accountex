-- =============================================================================
-- Finsoft ERP (FULL) — 07-sales.sql
-- This file = erp-basic/database/schema/07-sales.sql verbatim, plus columns
-- marked "-- [Full]" appended inside Basic tables (before the audit tail),
-- the extra channel values WHOLESALE / POS, and the FULL-ONLY section at the
-- end (pricing schemes, challans, returns, POS, credit control, reminders,
-- recurring invoices). Extra screens: app/sales/pos, /challans, /returns,
-- /recurring, /price-lists, app/receivables/credit, /reminders.
-- Sales & receivables: customers, pricing, quotations → sales orders →
-- invoices (STANDARD + COUNTER channels), credit notes, receipts & allocation.
--
-- Screens (Basic):
--   app/customers, app/customers/view                     src/41-acc-trade.html
--   app/sales/quotations, /orders, /invoices,
--   app/sales/invoices/new, /invoices/view, /credit-notes  src/41-acc-trade.html
--   app/receivables/receipts                              src/41-acc-trade.html
--   app/sales/voucher (Sales Voucher = COUNTER invoice)   src/43-sales-docs.html + src/93-sales-docs.js
--   app/receivables/ageing (views only, 90-views.sql)     src/45-studios.html + src/96-studio.js
--
-- Cross-module FKs (inv.*, acc.*, tax.*, treasury.*) are added in
-- database/fk/07-sales-fks.sql. Inline FKs here go only to sales/core/platform.
--
-- Design notes
--  * ONE invoice table for every sales channel (contract §5): Sales Voucher
--    writes Sales.SalesInvoices with channel = 'COUNTER' and doc type SV.
--  * Customer balance / overdue / utilisation are NEVER stored: they come from
--    views (v_customer_balance, v_ar_ageing, v_credit_exposure).
--  * Invoice / credit-note / receipt settlement columns (paid, applied,
--    balance, status) are maintained by the triggers at the end of this file
--    from Sales.CustomerReceiptAllocations and Sales.CreditNotes.
--  * Posted documents are frozen (Sales.triggerFreezeWhenPosted); corrections
--    go through credit notes, VOID + reversal journal, or a new receipt.
--  * Lines: qtyCtn × ctnFactor + qtyLoose = baseQty (pieces). bonusQty is
--    free goods in base units. Stock OUT = baseQty + bonusQty.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PriceLists — app/customers (New Customer "Price list": Standard 2026-27 /
-- Corporate / Distributor), app/sales/quotations (New Quotation "Price list"),
-- app/sales/invoices/new ("Prices from Standard 2026-27 price list").
-- Code / markup / rounding / default follow the Full screen
-- app/sales/price-lists (src/9A-company-plus.js LISTS: PL-RTL, PL-WHS …).
-- ---------------------------------------------------------------------------
CREATE TABLE "Sales"."PriceLists" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code             text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),     -- PL-WHS
  name             text NOT NULL,                                               -- Wholesale / Standard 2026-27
  "markupPct"       numeric(7,4) CHECK ("markupPct" >= 0),                        -- "+20% markup on cost"
  "roundingTo"      numeric(18,2) NOT NULL DEFAULT 1 CHECK ("roundingTo" > 0),    -- rounded to Rs 5 / Rs 1
  "isDefault"       boolean NOT NULL DEFAULT false,
  "currencyCode"    char(3) NOT NULL DEFAULT 'PKR' REFERENCES "Company"."Currencies"(code),
  "validFrom"       date,
  "validTo"         date,
  status           text NOT NULL DEFAULT 'ACTIVE',
  remarks          text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code),
  CONSTRAINT "priceListValidityChk" CHECK ("validTo" IS NULL OR "validFrom" IS NULL OR "validTo" >= "validFrom")
);
SELECT "Company"."addStandardTriggers"('"Sales"."PriceLists"', true);
CREATE UNIQUE INDEX "priceListOneDefault" ON "Sales"."PriceLists" ("tenantId") WHERE "isDefault" AND "deletedAt" IS NULL;
COMMENT ON TABLE "Sales"."PriceLists" IS 'Customer price lists (Retail / Wholesale / Distributor / Corporate). Assigned to customer groups and customers.';

-- PriceListItems — one price per item per list (effective-dated:
-- "price list saved … effective from tomorrow").
CREATE TABLE "Sales"."PriceListItems" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "priceListId"    uuid NOT NULL,
  "itemId"          uuid NOT NULL,                                               -- → Inventory.Products (fk file)
  price            numeric(18,4) NOT NULL CHECK (price >= 0),                   -- "List price"
  "effectiveFrom"   date NOT NULL DEFAULT current_date,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "priceListId", "itemId", "effectiveFrom"),
  FOREIGN KEY ("tenantId", "priceListId") REFERENCES "Sales"."PriceLists" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Sales"."PriceListItems"', true);
CREATE INDEX "priceListItemItemIdx" ON "Sales"."PriceListItems" ("tenantId", "itemId");
COMMENT ON TABLE "Sales"."PriceListItems" IS 'Item price on a price list, effective-dated. Current price = latest effectiveFrom <= document date.';

-- ---------------------------------------------------------------------------
-- CustomerGroups — app/customers ("Customer group": Corporate / Retail Chain /
-- Hospitality / Healthcare / Distributor; list filter "All groups").
-- ---------------------------------------------------------------------------
CREATE TABLE "Sales"."CustomerGroups" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code             text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),   -- CORPORATE, RETAIL_CHAIN
  name             text NOT NULL,
  "priceListId"    uuid,                                                        -- default list for the group
  "isActive"        boolean NOT NULL DEFAULT true,
  remarks          text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code),
  FOREIGN KEY ("tenantId", "priceListId") REFERENCES "Sales"."PriceLists" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Sales"."CustomerGroups"');
COMMENT ON TABLE "Sales"."CustomerGroups" IS 'Customer segmentation; drives default price list, filters and scheme eligibility.';

-- ---------------------------------------------------------------------------
-- customer — app/customers (list + "New Customer" modal), app/customers/view
-- (profile head, Overview tab), app/sales/voucher (customer / area / city
-- auto-fill), src/91-data.js customers[]. Guarantor block from Bhatti ACCOUNT
-- (plan: distribution credit). Shops are customers too (Full: channel).
-- ---------------------------------------------------------------------------
CREATE TABLE "Sales"."Customers" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                    text NOT NULL,                                        -- CUST-0001 (Company.getNextDocNo('CUST'))
  -- Basic information
  name                    text NOT NULL,                                        -- legal name "City Mart Superstores (Pvt) Ltd"
  "displayName"            text,                                                 -- "City Mart Superstores"
  "customerType"           text NOT NULL DEFAULT 'COMPANY',
  "customerGroupId"       uuid,
  "salesRepUserId"       uuid,                                                 -- "Sales rep" (Bilal Khan …)
  "branchId"               uuid,
  "customerSince"          date,                                                 -- "Customer since 14 Mar 2021"
  -- Tax registration
  ntn                     text CHECK (ntn IS NULL OR ntn ~ '^\d{7}-\d$'),        -- 3529184-2
  cnic                    text CHECK (cnic IS NULL OR cnic ~ '^\d{5}-\d{7}-\d$'),
  strn                    text CHECK (strn IS NULL OR strn ~ '^\d{2}-\d{2}-\d{4}-\d{3}-\d{2}$'),
  "atlStatus"              text NOT NULL DEFAULT 'NOT_ON_ATL',
  "isSalesTaxRegistered" boolean NOT NULL DEFAULT false,
  "applyFurtherTax"       boolean NOT NULL DEFAULT false,                       -- "Apply further tax 4%"
  "deductsWht"             boolean NOT NULL DEFAULT false,                       -- "Customer deducts WHT u/s 153"
  "whtSection"             text,                                                 -- "153(1)(a)"
  "whtRate"                numeric(7,4) CHECK ("whtRate" BETWEEN 0 AND 100),      -- 5
  "isGstExempt"           boolean NOT NULL DEFAULT false,                       -- "GST exempt / zero-rated"
  -- Contact & address
  "contactPerson"          text,
  mobile                  text,
  phone                   text,
  email                   citext,                                               -- "Accounts email"
  "billingAddress"         text,
  area                    text,                                                 -- Sales Voucher "Area" (Gulberg, DHA …)
  city                    text,
  province                text,
  "shippingSameAsBilling" boolean NOT NULL DEFAULT true,
  "shippingAddress"        text,
  -- Credit & accounting
  "creditLimit"            numeric(18,2) NOT NULL DEFAULT 0 CHECK ("creditLimit" >= 0),
  "paymentTerms"           text NOT NULL DEFAULT 'NET_30',
  "creditDays"             integer NOT NULL DEFAULT 30 CHECK ("creditDays" BETWEEN 0 AND 365),  -- Bhatti CR_DAYS
  "receivableAccountId"   uuid,                                                 -- 1130 Trade Debtors (→ Accounting.ChartOfAccounts)
  "priceListId"           uuid,
  "openingBalance"         numeric(18,2) NOT NULL DEFAULT 0,                     -- + = Dr (customer owes)
  "openingBalanceAsOf"   date,                                                 -- "As of 01 Jul 2026"
  "blockOverLimit"        boolean NOT NULL DEFAULT true,                        -- "Block sales when over limit"
  "autoReminders"          boolean NOT NULL DEFAULT true,                        -- "Send automatic reminders"
  -- Guarantor (Bhatti ACCOUNT block; distribution credit)
  "guarantorName"          text,
  "guarantorFatherName"   text,
  "guarantorCnic"          text CHECK ("guarantorCnic" IS NULL OR "guarantorCnic" ~ '^\d{5}-\d{7}-\d$'),
  "guarantorPhone"         text,
  "guarantorAddress"       text,
  -- Status (NEAR_LIMIT / OVERDUE are derived in Sales.getCustomerBalances)
  status                  text NOT NULL DEFAULT 'ACTIVE',
  "holdReason"             text,
  "onHoldSince"           timestamptz,
  -- [Full] channel & price tier — app/wholesale/* (src/9H-wholesale.js TIERS
  -- Retailer 1 / Wholesaler 0.95 / Distributor 0.90). A wholesale shop is a
  -- customer with customerChannel WHOLESALE + a Distribution.ShopRouteProfiles profile (GPS, route).
  "customerChannel"        text NOT NULL DEFAULT 'STANDARD',
  "priceTier"              text,
  "priceTierFactor"       numeric(7,4) NOT NULL DEFAULT 1 CHECK ("priceTierFactor" > 0 AND "priceTierFactor" <= 1),
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  "deletedAt"              timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code),
  FOREIGN KEY ("tenantId", "customerGroupId") REFERENCES "Sales"."CustomerGroups" ("tenantId", id),
  FOREIGN KEY ("tenantId", "salesRepUserId") REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "branchId")         REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "priceListId")     REFERENCES "Sales"."PriceLists" ("tenantId", id),
  CONSTRAINT "customerHoldReasonChk"  CHECK ((status = 'ON_HOLD') = ("holdReason" IS NOT NULL)),
  CONSTRAINT "customerOpeningDateChk" CHECK ("openingBalance" = 0 OR "openingBalanceAsOf" IS NOT NULL),
  CONSTRAINT "customerWhtChk"          CHECK (NOT "deductsWht" OR "whtRate" IS NOT NULL),
  CONSTRAINT "customerShippingChk"     CHECK ("shippingSameAsBilling" OR "shippingAddress" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Sales"."Customers"', true);
CREATE INDEX "customerNameTrgmIdx" ON "Sales"."Customers" USING gin (name gin_trgm_ops);
CREATE INDEX "customerGroupIdx"     ON "Sales"."Customers" ("tenantId", "customerGroupId");
CREATE INDEX "customerCityIdx"      ON "Sales"."Customers" ("tenantId", city);
CREATE INDEX "customerStatusIdx"    ON "Sales"."Customers" ("tenantId", status) WHERE "deletedAt" IS NULL;
CREATE INDEX "customerRepIdx"       ON "Sales"."Customers" ("tenantId", "salesRepUserId");
CREATE INDEX "customerNtnIdx"       ON "Sales"."Customers" ("tenantId", ntn) WHERE ntn IS NOT NULL;
COMMENT ON TABLE "Sales"."Customers" IS 'Customer master (AR sub-ledger party). Balance, overdue and utilisation are derived (Sales.getCustomerBalances).';
COMMENT ON COLUMN "Sales"."Customers".status IS 'Stored states only. Badges "Near limit" and "Overdue" are derived in Sales.getCustomerBalances.display_status.';
COMMENT ON COLUMN "Sales"."Customers"."openingBalance" IS 'Opening receivable at openingBalanceAsOf; positive = debit. Settled through CustomerReceiptAllocations target OPENING_BALANCE.';

-- CustomerContacts — app/customers/view "Contacts" tab (name, role, primary,
-- mobile / phone, email).
CREATE TABLE "Sales"."CustomerContacts" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "customerId"      uuid NOT NULL,
  "fullName"        text NOT NULL,                                               -- Imran Aslam
  designation      text,                                                        -- Head of Procurement
  "isPrimary"       boolean NOT NULL DEFAULT false,
  mobile           text,
  phone            text,                                                        -- 042-35761190 ext 214
  email            citext,
  "receivesInvoices"  boolean NOT NULL DEFAULT false,                            -- accounts contact for invoice e-mail / reminders
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "customerId") REFERENCES "Sales"."Customers" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Sales"."CustomerContacts"');
CREATE INDEX "customerContactCustomerIdx" ON "Sales"."CustomerContacts" ("tenantId", "customerId");
CREATE UNIQUE INDEX "customerContactOnePrimary" ON "Sales"."CustomerContacts" ("tenantId", "customerId")
  WHERE "isPrimary" AND "deletedAt" IS NULL;
COMMENT ON TABLE "Sales"."CustomerContacts" IS 'Named contacts of a customer (customer detail → Contacts tab).';

-- CustomerNotes — app/customers/view "Notes" tab ("Add a note … visible to
-- finance and sales team"; author + date). Helper table in the sales schema.
CREATE TABLE "Sales"."CustomerNotes" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "customerId"      uuid NOT NULL,
  "authorUserId"   uuid,
  note             text NOT NULL CHECK (length(note) BETWEEN 1 AND 4000),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "customerId")    REFERENCES "Sales"."Customers" ("tenantId", id),
  FOREIGN KEY ("tenantId", "authorUserId") REFERENCES "Company"."Users" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Sales"."CustomerNotes"');
CREATE INDEX "customerNoteCustomerIdx" ON "Sales"."CustomerNotes" ("tenantId", "customerId", "createdAt" DESC);
COMMENT ON TABLE "Sales"."CustomerNotes" IS 'Free-text account notes on the customer detail page (collections promises, limit requests).';

-- ---------------------------------------------------------------------------
-- quotation — app/sales/quotations (list, "New Quotation" modal, "Convert to
-- Sales Order", "Revise" = duplicate). QT-2026-000086.
-- ---------------------------------------------------------------------------
CREATE TABLE "Sales"."Quotations" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"             text NOT NULL,                                             -- QT-2026-000086
  "docDate"           date NOT NULL,                                             -- "Quote date"
  "validTill"         date NOT NULL,
  "customerId"        uuid NOT NULL,
  subject            text,                                                      -- "IT hardware refresh"
  "salesRepUserId"  uuid,
  "branchId"          uuid,
  "priceListId"      uuid,
  "revisionOfId"     uuid,                                                      -- "Revise" duplicates an expired quote
  "currencyCode"      char(3) NOT NULL DEFAULT 'PKR' REFERENCES "Company"."Currencies"(code),
  "fxRate"            numeric(18,6) NOT NULL DEFAULT 1 CHECK ("fxRate" > 0),
  "grossAmount"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("grossAmount" >= 0),     -- Subtotal
  "discountAmount"    numeric(18,2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),
  "taxAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),       -- GST 18%
  "netAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("netAmount" >= 0),       -- Total
  status             text NOT NULL DEFAULT 'DRAFT',
  "sentAt"            timestamptz,
  "acceptedAt"        timestamptz,
  remarks            text,
  terms              text,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  FOREIGN KEY ("tenantId", "customerId")       REFERENCES "Sales"."Customers" ("tenantId", id),
  FOREIGN KEY ("tenantId", "salesRepUserId") REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "branchId")         REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "priceListId")     REFERENCES "Sales"."PriceLists" ("tenantId", id),
  FOREIGN KEY ("tenantId", "revisionOfId")    REFERENCES "Sales"."Quotations" ("tenantId", id),
  CONSTRAINT "quotationValidityChk" CHECK ("validTill" >= "docDate"),
  CONSTRAINT "quotationTotalChk"    CHECK ("netAmount" = "grossAmount" - "discountAmount" + "taxAmount"),
  CONSTRAINT "quotationDiscountChk" CHECK ("discountAmount" <= "grossAmount")
);
SELECT "Company"."addStandardTriggers"('"Sales"."Quotations"', true);
CREATE INDEX "quotationCustomerIdx" ON "Sales"."Quotations" ("tenantId", "customerId", "docDate" DESC);
CREATE INDEX "quotationStatusIdx"   ON "Sales"."Quotations" ("tenantId", status, "validTill");
CREATE INDEX "quotationRepIdx"      ON "Sales"."Quotations" ("tenantId", "salesRepUserId", "docDate" DESC);
COMMENT ON TABLE "Sales"."Quotations" IS 'Price offer to a customer. ACCEPTED quotes convert to a sales order (status CONVERTED, SalesOrders.quotationId).';

CREATE TABLE "Sales"."QuotationLines" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "quotationId"     uuid NOT NULL,
  "lineNo"          smallint NOT NULL CHECK ("lineNo" > 0),
  "itemId"          uuid,                                                        -- → Inventory.Products (fk file); NULL = free-text line
  description      text NOT NULL,                                               -- "IT-LAP-5440 · Dell Latitude 5440"
  "qtyCtn"          numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyCtn" >= 0),
  "qtyLoose"        numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyLoose" >= 0),
  "ctnFactor"       numeric(18,3) NOT NULL DEFAULT 1 CHECK ("ctnFactor" > 0),
  "baseQty"         numeric(18,3) NOT NULL CHECK ("baseQty" > 0),                 -- "Qty"
  rate             numeric(18,4) NOT NULL CHECK (rate >= 0),
  "grossAmount"     numeric(18,2) NOT NULL CHECK ("grossAmount" >= 0),
  "discountPct"     numeric(7,4) NOT NULL DEFAULT 0 CHECK ("discountPct" BETWEEN 0 AND 100),
  "discountAmount"  numeric(18,2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),
  "taxableAmount"   numeric(18,2) NOT NULL CHECK ("taxableAmount" >= 0),          -- "Amount" (excl. GST)
  "taxCodeId"      uuid,                                                        -- → Tax.TaxCodes ("GST 18%")
  "taxRate"         numeric(7,4) NOT NULL DEFAULT 0 CHECK ("taxRate" BETWEEN 0 AND 100),
  "taxAmount"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
  "totalAmount"     numeric(18,2) NOT NULL CHECK ("totalAmount" >= 0),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "quotationId", "lineNo"),
  FOREIGN KEY ("tenantId", "quotationId") REFERENCES "Sales"."Quotations" ("tenantId", id),
  CONSTRAINT "quotationLineQtyChk"     CHECK ("baseQty" = "qtyCtn" * "ctnFactor" + "qtyLoose"),
  CONSTRAINT "quotationLineTaxableChk" CHECK ("taxableAmount" = "grossAmount" - "discountAmount"),
  CONSTRAINT "quotationLineTotalChk"   CHECK ("totalAmount" = "taxableAmount" + "taxAmount")
);
SELECT "Company"."addStandardTriggers"('"Sales"."QuotationLines"');
CREATE INDEX "quotationLineItemIdx" ON "Sales"."QuotationLines" ("tenantId", "itemId");

-- ---------------------------------------------------------------------------
-- SalesOrders — app/sales/orders (list: Order #, PO ref, Order/Delivery date,
-- Warehouse, Fulfilment, Status) + "Convert to Sales Order" modal
-- (expected delivery, ship-from warehouse, customer PO reference, reserve
-- stock, e-mail confirmation). SO-2026-000094.
-- ---------------------------------------------------------------------------
CREATE TABLE "Sales"."SalesOrders" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"             text NOT NULL,                                             -- SO-2026-000094
  "docDate"           date NOT NULL,                                             -- "Order date"
  "customerId"        uuid NOT NULL,
  "quotationId"       uuid,                                                      -- "From QT-2026-000082"
  "branchId"          uuid,
  "warehouseId"       uuid,                                                      -- "Ship from warehouse" (→ Inventory.Warehouses)
  "expectedDeliveryDate" date,                                                  -- "Delivery Date"
  "customerPoRef"    text,                                                      -- "PO: SIH/IT/0912"
  "customerPoDate"   date,
  "salesRepUserId"  uuid,
  "priceListId"      uuid,
  "paymentTerms"      text,
  "reserveStock"      boolean NOT NULL DEFAULT true,                             -- "Reserve stock on confirmation"
  "emailConfirmation" boolean NOT NULL DEFAULT false,
  "currencyCode"      char(3) NOT NULL DEFAULT 'PKR' REFERENCES "Company"."Currencies"(code),
  "fxRate"            numeric(18,6) NOT NULL DEFAULT 1 CHECK ("fxRate" > 0),
  "grossAmount"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("grossAmount" >= 0),
  "discountAmount"    numeric(18,2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),
  "taxAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
  "netAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("netAmount" >= 0),   -- "Amount (Rs)"
  status             text NOT NULL DEFAULT 'CONFIRMED',
  "holdReason"        text,                                                      -- "Blocked — credit hold"
  "confirmedAt"       timestamptz,
  "cancelledAt"       timestamptz,
  "cancelReason"      text,
  remarks            text,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  FOREIGN KEY ("tenantId", "customerId")       REFERENCES "Sales"."Customers" ("tenantId", id),
  FOREIGN KEY ("tenantId", "quotationId")      REFERENCES "Sales"."Quotations" ("tenantId", id),
  FOREIGN KEY ("tenantId", "branchId")         REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "salesRepUserId") REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "priceListId")     REFERENCES "Sales"."PriceLists" ("tenantId", id),
  CONSTRAINT "salesOrderTotalChk"    CHECK ("netAmount" = "grossAmount" - "discountAmount" + "taxAmount"),
  CONSTRAINT "salesOrderDeliveryChk" CHECK ("expectedDeliveryDate" IS NULL OR "expectedDeliveryDate" >= "docDate"),
  CONSTRAINT "salesOrderHoldChk"     CHECK (status <> 'ON_HOLD' OR "holdReason" IS NOT NULL),
  CONSTRAINT "salesOrderCancelChk"   CHECK (status <> 'CANCELLED' OR "cancelledAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Sales"."SalesOrders"', true);
CREATE INDEX "salesOrderCustomerIdx"  ON "Sales"."SalesOrders" ("tenantId", "customerId", "docDate" DESC);
CREATE INDEX "salesOrderStatusIdx"    ON "Sales"."SalesOrders" ("tenantId", status, "expectedDeliveryDate");
CREATE INDEX "salesOrderWarehouseIdx" ON "Sales"."SalesOrders" ("tenantId", "warehouseId", "docDate" DESC);
CREATE INDEX "salesOrderQuotationIdx" ON "Sales"."SalesOrders" ("tenantId", "quotationId") WHERE "quotationId" IS NOT NULL;
COMMENT ON TABLE "Sales"."SalesOrders" IS 'Confirmed customer order. LATE is derived (expectedDeliveryDate < today and not fully delivered); fulfilment % from line deliveredQty.';

CREATE TABLE "Sales"."SalesOrderLines" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "salesOrderId"     uuid NOT NULL,
  "lineNo"            smallint NOT NULL CHECK ("lineNo" > 0),
  "quotationLineId"  uuid,
  "itemId"            uuid,                                                      -- → Inventory.Products
  description        text NOT NULL,
  "qtyCtn"            numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyCtn" >= 0),
  "qtyLoose"          numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyLoose" >= 0),
  "ctnFactor"         numeric(18,3) NOT NULL DEFAULT 1 CHECK ("ctnFactor" > 0),
  "baseQty"           numeric(18,3) NOT NULL CHECK ("baseQty" > 0),               -- ordered
  "bonusQty"          numeric(18,3) NOT NULL DEFAULT 0 CHECK ("bonusQty" >= 0),
  rate               numeric(18,4) NOT NULL CHECK (rate >= 0),                  -- locked at quotation rate
  "grossAmount"       numeric(18,2) NOT NULL CHECK ("grossAmount" >= 0),
  "discountPct"       numeric(7,4) NOT NULL DEFAULT 0 CHECK ("discountPct" BETWEEN 0 AND 100),
  "discountAmount"    numeric(18,2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),
  "taxableAmount"     numeric(18,2) NOT NULL CHECK ("taxableAmount" >= 0),
  "taxCodeId"        uuid,
  "taxRate"           numeric(7,4) NOT NULL DEFAULT 0 CHECK ("taxRate" BETWEEN 0 AND 100),
  "taxAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
  "totalAmount"       numeric(18,2) NOT NULL CHECK ("totalAmount" >= 0),
  "deliveredQty"      numeric(18,3) NOT NULL DEFAULT 0 CHECK ("deliveredQty" >= 0),   -- "6 of 15 laptops"
  "invoicedQty"       numeric(18,3) NOT NULL DEFAULT 0 CHECK ("invoicedQty" >= 0),
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "salesOrderId", "lineNo"),
  FOREIGN KEY ("tenantId", "salesOrderId")    REFERENCES "Sales"."SalesOrders" ("tenantId", id),
  FOREIGN KEY ("tenantId", "quotationLineId") REFERENCES "Sales"."QuotationLines" ("tenantId", id),
  CONSTRAINT "salesOrderLineQtyChk"       CHECK ("baseQty" = "qtyCtn" * "ctnFactor" + "qtyLoose"),
  CONSTRAINT "salesOrderLineTaxableChk"   CHECK ("taxableAmount" = "grossAmount" - "discountAmount"),
  CONSTRAINT "salesOrderLineTotalChk"     CHECK ("totalAmount" = "taxableAmount" + "taxAmount"),
  CONSTRAINT "salesOrderLineDeliveredChk" CHECK ("deliveredQty" <= "baseQty" + "bonusQty"),
  CONSTRAINT "salesOrderLineInvoicedChk"  CHECK ("invoicedQty" <= "baseQty" + "bonusQty")
);
SELECT "Company"."addStandardTriggers"('"Sales"."SalesOrderLines"');
CREATE INDEX "salesOrderLineItemIdx" ON "Sales"."SalesOrderLines" ("tenantId", "itemId");
-- open lines to deliver / invoice
CREATE INDEX "salesOrderLineOpenIdx" ON "Sales"."SalesOrderLines" ("tenantId", "salesOrderId")
  WHERE "deliveredQty" < "baseQty" + "bonusQty" OR "invoicedQty" < "baseQty" + "bonusQty";

-- ---------------------------------------------------------------------------
-- invoice — ONE table for every sales channel.
--   STANDARD  INV-2026-000146  app/sales/invoices, /invoices/new, /invoices/view
--   COUNTER   SV-2026-000123   app/sales/voucher (Sales Voucher; prints a
--                              sales-tax invoice no. INV-… = taxInvoiceNo)
-- Header fields: New Sales Invoice "Customer & terms", Bill to / Ship to,
-- Totals, Delivery toggles; Invoice view (FBR invoice #, activity, payment
-- status); Sales Voucher refs (Sale No, Customer PO No/Date, Invoice No,
-- Bill Book No), Order & Customer (area, city), Fulfillment & Sales Team
-- (booker, deliveryman, salesman, supervisor, sale type, terms, place),
-- delivery slot, Receive Payment "Cash tendered".
-- Status badges: Draft / Sent / Partially Paid / Paid / Overdue (derived).
-- "Sent" = POSTED with sentAt set.
-- ---------------------------------------------------------------------------
CREATE TABLE "Sales"."SalesInvoices" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                text NOT NULL,                                          -- INV-2026-000146 / SV-2026-000123
  channel               text NOT NULL DEFAULT 'STANDARD',
  "taxInvoiceNo"        text,                                                   -- Sales Voucher "Invoice No" (INV-… printed on the tax invoice)
  "docDate"              date NOT NULL,                                          -- "Invoice date" / "Sale Date"
  "customerId"           uuid NOT NULL,                                          -- walk-in sales use the Walk-in customer row
  "branchId"             uuid NOT NULL,
  "warehouseId"          uuid,                                                   -- "Warehouse" / "Place / Warehouse" (→ Inventory.Warehouses)
  "salesOrderId"        uuid,
  "quotationId"          uuid,
  "customerPoNo"        text,                                                   -- "Customer PO #" / "Customer PO No"
  "customerPoDate"      date,                                                   -- Sales Voucher "PO Date"
  "salesRepUserId"     uuid,                                                   -- "Sales rep"
  "priceListId"         uuid,
  "paymentTerms"         text NOT NULL DEFAULT 'NET_30',
  "dueDate"              date NOT NULL,
  -- buyer snapshot printed on the sales-tax invoice (FBR requires it as at invoice date)
  "buyerName"            text NOT NULL,                                          -- "Bill to" / walk-in name
  "buyerAddress"         text,
  "buyerNtn"             text,
  "buyerStrn"            text,
  "buyerCnic"            text,
  "buyerArea"            text,                                                   -- Sales Voucher "Area"
  "buyerCity"            text,                                                   -- Sales Voucher "City"
  "shipToAddress"       text,                                                   -- "Ship to"
  "contactName"          text,                                                   -- "Contact"
  "contactPhone"         text,
  "contactEmail"         citext,
  -- Sales Voucher (counter / trade) fields — Bhatti MSALE heritage
  "saleType"             text NOT NULL DEFAULT 'REGULAR',
  "billBookNo"          text,                                                   -- "Bill Book No" BB-01
  "bookerName"           text,                                                   -- Basic: names; Full adds *_employee_id
  "deliverymanName"      text,
  "salesmanName"         text,                                                   -- "Commission follows the salesman"
  "supervisorName"       text,
  "deliverySlot"         text,
  -- money
  "currencyCode"         char(3) NOT NULL DEFAULT 'PKR' REFERENCES "Company"."Currencies"(code),
  "fxRate"               numeric(18,6) NOT NULL DEFAULT 1 CHECK ("fxRate" > 0),
  "grossAmount"          numeric(18,2) NOT NULL DEFAULT 0 CHECK ("grossAmount" >= 0),    -- "Subtotal (gross)"
  "discountAmount"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0), -- "Discount"
  "taxableAmount"        numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxableAmount" >= 0),  -- "Taxable value" / "Value excl. sales tax"
  "taxAmount"            numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),      -- "GST 18%"
  "furtherTaxAmount"    numeric(18,2) NOT NULL DEFAULT 0 CHECK ("furtherTaxAmount" >= 0), -- "Further tax 4% (unregistered only)"
  "advanceTaxRate"      numeric(7,4) NOT NULL DEFAULT 0 CHECK ("advanceTaxRate" BETWEEN 0 AND 100), -- s.236G 0.1% / 236H 0.5% (Tax Codes "Advance Tax Collected")
  "advanceTaxAmount"    numeric(18,2) NOT NULL DEFAULT 0 CHECK ("advanceTaxAmount" >= 0),  -- collected on the invoice, Cr 2232
  "fbrServiceFee"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("fbrServiceFee" >= 0),    -- "FBR POS service fee Rs 1"
  "netAmount"            numeric(18,2) NOT NULL DEFAULT 0 CHECK ("netAmount" >= 0),      -- "Invoice total" / "Net Amount"
  "expectedWhtAmount"   numeric(18,2) NOT NULL DEFAULT 0 CHECK ("expectedWhtAmount" >= 0), -- "WHT u/s 153(1)(a) @ 5% (est., by customer)"
  "paidAmount"           numeric(18,2) NOT NULL DEFAULT 0 CHECK ("paidAmount" >= 0),     -- "Received to date (incl. WHT)" — trigger-maintained
  "creditAppliedAmount" numeric(18,2) NOT NULL DEFAULT 0 CHECK ("creditAppliedAmount" >= 0), -- credit notes applied — trigger-maintained
  "balanceAmount"        numeric(18,2) GENERATED ALWAYS AS ("netAmount" - "paidAmount" - "creditAppliedAmount") STORED, -- "Balance due"
  "costAmount"          numeric(18,2) NOT NULL DEFAULT 0 CHECK ("costAmount" >= 0),     -- COGS at moving average (sum of lines)
  "cashTendered"         numeric(18,2) CHECK ("cashTendered" >= 0),                      -- "Cash tendered by customer"
  -- workflow flags ("Delivery — on Save & send", Sales Voucher "Hold")
  "isHeld"               boolean NOT NULL DEFAULT false,                         -- parked draft ("Held" list)
  "heldAt"               timestamptz,
  "emailPdf"             boolean NOT NULL DEFAULT true,                          -- "Email PDF to …"
  "submitToFbr"         boolean NOT NULL DEFAULT true,                          -- "Submit to FBR on posting"
  "sendWhatsappLink"    boolean NOT NULL DEFAULT false,                         -- "Send WhatsApp payment link"
  "autoReminder"         boolean NOT NULL DEFAULT true,                          -- "Auto-reminder 3 days before due"
  "customerNotes"        text,                                                   -- "Customer notes" (printed)
  "termsConditions"      text,                                                   -- "Terms & conditions" (printed)
  remarks               text,                                                   -- Sales Voucher "Remarks"
  -- lifecycle
  status                text NOT NULL DEFAULT 'DRAFT',
  "postedAt"             timestamptz,
  "postedByUserId"     uuid,
  "journalEntryId"      uuid,                                                   -- "GL voucher JV-2026-000412" (→ Accounting.Vouchers)
  "sentAt"               timestamptz,                                            -- "Emailed to Packages Ltd" → badge "Sent"
  "viewedAt"             timestamptz,                                            -- "Viewed by customer"
  "fbrStatus"            text NOT NULL DEFAULT 'NOT_REQUIRED',
  "fbrInvoiceNo"        text,                                                   -- FBR IRN "4271839612609271532A8F"
  "fbrSubmittedAt"      timestamptz,
  "fbrError"             text,
  "voidReason"           text,
  "voidedAt"             timestamptz,
  "voidedByUserId"     uuid,
  "reversalJournalEntryId" uuid,                                               -- → Accounting.Vouchers
  -- [Full] wholesale / distribution / POS / recurring links
  "priceTier"            text,   -- tier snapshot ("Rates ×0.90")
  "priceTierFactor"     numeric(7,4) CHECK ("priceTierFactor" > 0 AND "priceTierFactor" <= 1),
  "creditOverrideId"    uuid,                                                   -- approved override that let it post (→ Sales.CreditOverrides)
  "routeId"              uuid,                                                   -- → Distribution.Routes (fk file)
  "bookerEmployeeId"    uuid,                                                   -- → HumanResources.Employees (fk file)
  "deliverymanEmployeeId" uuid,
  "salesmanEmployeeId"  uuid,
  "supervisorEmployeeId" uuid,
  "posShiftId"          uuid,                                                   -- POS channel → Sales.PosShifts
  "recurringProfileId"  uuid,                                                   -- raised by Sales.RecurringInvoices
  "deliveryChallanId"   uuid,                                                   -- "Convert to invoice" from a challan
  "shipToAddressId"    uuid,                                                   -- → Sales.CustomerAddresses
  "schemeId"             uuid,                                                   -- invoice-level scheme (INVOICE_DISCOUNT / SETTLEMENT)
  "schemeAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("schemeAmount" >= 0),  -- part of discountAmount given by schemes
  "stockIssueMode"      text NOT NULL DEFAULT 'AT_POSTING', -- delivery-run invoices issue stock when the van is dispatched
  "stockIssuedAt"       timestamptz,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  UNIQUE ("tenantId", id, "customerId"),                                          -- target of CustomerReceiptAllocations (same-customer FK)
  FOREIGN KEY ("tenantId", "customerId")       REFERENCES "Sales"."Customers" ("tenantId", id),
  FOREIGN KEY ("tenantId", "branchId")         REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "salesOrderId")    REFERENCES "Sales"."SalesOrders" ("tenantId", id),
  FOREIGN KEY ("tenantId", "quotationId")      REFERENCES "Sales"."Quotations" ("tenantId", id),
  FOREIGN KEY ("tenantId", "salesRepUserId") REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "priceListId")     REFERENCES "Sales"."PriceLists" ("tenantId", id),
  FOREIGN KEY ("tenantId", "postedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "voidedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "invoiceTaxableChk"  CHECK ("taxableAmount" = "grossAmount" - "discountAmount"),
  CONSTRAINT "invoiceNetChk"      CHECK ("netAmount" = "taxableAmount" + "taxAmount" + "furtherTaxAmount" + "advanceTaxAmount" + "fbrServiceFee"),
  CONSTRAINT "invoiceOverpaidChk" CHECK ("paidAmount" + "creditAppliedAmount" <= "netAmount"),
  CONSTRAINT "invoiceDueChk"      CHECK ("dueDate" >= "docDate"),
  CONSTRAINT "invoicePostedChk"   CHECK (status = 'DRAFT' OR status = 'VOID' OR "postedAt" IS NOT NULL),
  CONSTRAINT "invoiceVoidChk"     CHECK (status <> 'VOID' OR ("voidReason" IS NOT NULL AND "voidedAt" IS NOT NULL AND "paidAmount" = 0)),
  CONSTRAINT "invoiceHeldChk"     CHECK (NOT "isHeld" OR status = 'DRAFT'),
  CONSTRAINT "invoiceFbrChk"      CHECK ("fbrStatus" <> 'POSTED' OR "fbrInvoiceNo" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Sales"."SalesInvoices"', true);
CREATE UNIQUE INDEX "invoiceTaxInvoiceNoUq" ON "Sales"."SalesInvoices" ("tenantId", "taxInvoiceNo") WHERE "taxInvoiceNo" IS NOT NULL;
CREATE UNIQUE INDEX "invoiceFbrNoUq"         ON "Sales"."SalesInvoices" ("tenantId", "fbrInvoiceNo") WHERE "fbrInvoiceNo" IS NOT NULL;
CREATE INDEX "invoiceCustomerIdx"  ON "Sales"."SalesInvoices" ("tenantId", "customerId", "docDate" DESC);
CREATE INDEX "invoiceStatusIdx"    ON "Sales"."SalesInvoices" ("tenantId", status, "dueDate");
CREATE INDEX "invoiceBranchIdx"    ON "Sales"."SalesInvoices" ("tenantId", "branchId", "docDate" DESC);
CREATE INDEX "invoiceChannelIdx"   ON "Sales"."SalesInvoices" ("tenantId", channel, "docDate" DESC);
CREATE INDEX "invoiceSoIdx"        ON "Sales"."SalesInvoices" ("tenantId", "salesOrderId") WHERE "salesOrderId" IS NOT NULL;
CREATE INDEX "invoiceOpenIdx"      ON "Sales"."SalesInvoices" ("tenantId", "customerId", "dueDate")
  WHERE status IN ('POSTED','PARTIALLY_PAID');                                  -- ageing / allocation picker
CREATE INDEX "invoiceHeldIdx"      ON "Sales"."SalesInvoices" ("tenantId", "branchId") WHERE "isHeld";
CREATE INDEX "invoiceFbrPendingIdx" ON "Sales"."SalesInvoices" ("tenantId", "fbrStatus") WHERE "fbrStatus" IN ('PENDING','FAILED');
CREATE INDEX "invoiceBuyerTrgmIdx" ON "Sales"."SalesInvoices" USING gin ("buyerName" gin_trgm_ops);
COMMENT ON TABLE "Sales"."SalesInvoices" IS 'Sales invoice for every channel (STANDARD INV-, COUNTER SV-; Full adds WHOLESALE WS-, POS POS-). OVERDUE is derived: dueDate < today AND balanceAmount > 0.';
COMMENT ON COLUMN "Sales"."SalesInvoices"."paidAmount" IS 'Sum of CustomerReceiptAllocations to this invoice from receipts not BOUNCED/VOID (cash + WHT + bank charges). Trigger-maintained.';
COMMENT ON COLUMN "Sales"."SalesInvoices"."taxInvoiceNo" IS 'Separate sales-tax invoice number printed by the Sales Voucher (SV docNo + INV tax invoice no).';

-- SalesInvoiceLines — New Sales Invoice "Line items" (Item, Description, Qty, Rate,
-- Disc %, Tax code GST 18% / GST 0% / Exempt, Amount), Invoice view (HS Code,
-- Value excl. tax, GST, Total), Sales Voucher grid (Product, Pack,
-- Batch / Expiry, Qty, Bonus, Sale Rate, Gross, Disc %, GST % 0/5/10/17/18,
-- Net Rate, Net Amount), posting preview (4010 Sales — Goods / 4020 Service).
CREATE TABLE "Sales"."SalesInvoiceLines" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "invoiceId"          uuid NOT NULL,
  "lineNo"             smallint NOT NULL CHECK ("lineNo" > 0),
  "salesOrderLineId" uuid,
  "itemId"             uuid,                                                     -- → Inventory.Products; NULL = free-text service line
  description         text NOT NULL,
  "hsCode"             text CHECK ("hsCode" IS NULL OR "hsCode" ~ '^\d{4}(\.\d{2,4})?$'),  -- 4819.1000
  "packLabel"          text,                                                     -- "Bundle 25"
  "batchId"            uuid,                                                     -- → Inventory.ProductBatches (FEFO pick)
  "expiryDate"         date,                                                     -- snapshot of batch expiry
  "qtyCtn"             numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyCtn" >= 0),
  "qtyLoose"           numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyLoose" >= 0),
  "ctnFactor"          numeric(18,3) NOT NULL DEFAULT 1 CHECK ("ctnFactor" > 0),
  "baseQty"            numeric(18,3) NOT NULL CHECK ("baseQty" > 0),              -- "Qty"
  "bonusQty"           numeric(18,3) NOT NULL DEFAULT 0 CHECK ("bonusQty" >= 0),  -- "Bonus" (free goods)
  rate                numeric(18,4) NOT NULL CHECK (rate >= 0),                 -- "Rate" / "Sale Rate"
  "grossAmount"        numeric(18,2) NOT NULL CHECK ("grossAmount" >= 0),         -- "Gross"
  "discountPct"        numeric(7,4) NOT NULL DEFAULT 0 CHECK ("discountPct" BETWEEN 0 AND 100),
  "discountAmount"     numeric(18,2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),
  "taxableAmount"      numeric(18,2) NOT NULL CHECK ("taxableAmount" >= 0),       -- "Value excl. tax"
  "taxCodeId"         uuid,                                                     -- → Tax.TaxCodes
  "taxRate"            numeric(7,4) NOT NULL DEFAULT 0 CHECK ("taxRate" BETWEEN 0 AND 100),   -- "GST %"
  "taxAmount"          numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
  "furtherTaxRate"    numeric(7,4) NOT NULL DEFAULT 0 CHECK ("furtherTaxRate" BETWEEN 0 AND 100),
  "furtherTaxAmount"  numeric(18,2) NOT NULL DEFAULT 0 CHECK ("furtherTaxAmount" >= 0),
  "totalAmount"        numeric(18,2) NOT NULL CHECK ("totalAmount" >= 0),         -- "Amount" / "Net Amount"
  "revenueAccountId"  uuid,                                                     -- → Accounting.ChartOfAccounts (4010 / 4020)
  "unitCost"           numeric(18,4) CHECK ("unitCost" >= 0),                     -- moving average at posting
  "costAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("costAmount" >= 0),-- COGS = unitCost × (baseQty + bonusQty)
  -- [Full]
  "listRate"           numeric(18,4) CHECK ("listRate" >= 0),                     -- price-list rate before tier factor / quantity break
  "isManualRate"      boolean NOT NULL DEFAULT false,                           -- rate typed over the tier rate (9H-wholesale l.manual)
  "schemeId"           uuid,                                                     -- scheme that granted bonusQty / discount (→ Sales.SalesSchemes)
  "deliveryChallanLineId" uuid,                                                -- stock already issued by the challan
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "invoiceId", "lineNo"),
  FOREIGN KEY ("tenantId", "invoiceId")          REFERENCES "Sales"."SalesInvoices" ("tenantId", id),
  FOREIGN KEY ("tenantId", "salesOrderLineId") REFERENCES "Sales"."SalesOrderLines" ("tenantId", id),
  CONSTRAINT "invoiceLineQtyChk"      CHECK ("baseQty" = "qtyCtn" * "ctnFactor" + "qtyLoose"),
  CONSTRAINT "invoiceLineTaxableChk"  CHECK ("taxableAmount" = "grossAmount" - "discountAmount"),
  CONSTRAINT "invoiceLineTotalChk"    CHECK ("totalAmount" = "taxableAmount" + "taxAmount" + "furtherTaxAmount"),
  CONSTRAINT "invoiceLineDiscountChk" CHECK ("discountAmount" <= "grossAmount")
);
SELECT "Company"."addStandardTriggers"('"Sales"."SalesInvoiceLines"', true);
CREATE INDEX "invoiceLineItemIdx"  ON "Sales"."SalesInvoiceLines" ("tenantId", "itemId");
CREATE INDEX "invoiceLineBatchIdx" ON "Sales"."SalesInvoiceLines" ("tenantId", "batchId") WHERE "batchId" IS NOT NULL;
CREATE INDEX "invoiceLineSolIdx"   ON "Sales"."SalesInvoiceLines" ("tenantId", "salesOrderLineId") WHERE "salesOrderLineId" IS NOT NULL;
COMMENT ON TABLE "Sales"."SalesInvoiceLines" IS 'Invoice lines. Net rate (Sales Voucher) = totalAmount / baseQty, derived.';

-- ---------------------------------------------------------------------------
-- CreditNotes — app/sales/credit-notes (list: CN #, Customer, Date, Against
-- Invoice, Reason, Value, GST, Total, Status; "New Credit Note": customer,
-- against invoice, date, reason, return to warehouse, treatment, narration,
-- lines from invoice with return qty). CN-2026-000021.
-- ---------------------------------------------------------------------------
CREATE TABLE "Sales"."CreditNotes" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"               text NOT NULL,                                           -- CN-2026-000021
  "docDate"             date NOT NULL,
  "customerId"          uuid NOT NULL,
  "invoiceId"           uuid,                                                    -- "Against invoice *" (required by the Basic screen; NULL only for Full returns without invoice)
  "branchId"            uuid,
  reason               text NOT NULL,
  "reasonNote"          text,                                                    -- "Damaged goods (40 rolls)", "Disputed pricing"
  "returnWarehouseId"  uuid,                                                    -- "Return to warehouse" (→ Inventory.Warehouses)
  treatment            text NOT NULL DEFAULT 'APPLY_TO_INVOICE',
  "currencyCode"        char(3) NOT NULL DEFAULT 'PKR' REFERENCES "Company"."Currencies"(code),
  "fxRate"              numeric(18,6) NOT NULL DEFAULT 1 CHECK ("fxRate" > 0),
  "valueAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("valueAmount" >= 0),     -- "Value"
  "taxAmount"           numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),       -- "GST 18% reversed"
  "furtherTaxAmount"   numeric(18,2) NOT NULL DEFAULT 0 CHECK ("furtherTaxAmount" >= 0),
  "totalAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("totalAmount" >= 0),     -- "Credit note total"
  "appliedAmount"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("appliedAmount" >= 0),   -- trigger-maintained
  "refundedAmount"      numeric(18,2) NOT NULL DEFAULT 0 CHECK ("refundedAmount" >= 0),
  "balanceAmount"       numeric(18,2) GENERATED ALWAYS AS ("totalAmount" - "appliedAmount" - "refundedAmount") STORED, -- "Open (Unapplied)"
  "costAmount"          numeric(18,2) NOT NULL DEFAULT 0 CHECK ("costAmount" >= 0),      -- stock returned at cost
  narration            text,
  status               text NOT NULL DEFAULT 'DRAFT',
  "submittedAt"         timestamptz,                                             -- "Submit for approval"
  "approvedByUserId"  uuid,
  "approvedAt"          timestamptz,
  "postedAt"            timestamptz,
  "journalEntryId"     uuid,                                                    -- → Accounting.Vouchers
  "refundReference"     text,                                                    -- treatment REFUND: payment voucher ref
  "cancelledAt"         timestamptz,
  "cancelReason"        text,
  -- [Full]
  "salesReturnId"      uuid,                                                    -- raised by app/sales/returns (→ Sales.SalesReturns)
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  UNIQUE ("tenantId", id, "customerId"),                                          -- target of CustomerReceiptAllocations
  FOREIGN KEY ("tenantId", "customerId")         REFERENCES "Sales"."Customers" ("tenantId", id),
  FOREIGN KEY ("tenantId", "invoiceId", "customerId") REFERENCES "Sales"."SalesInvoices" ("tenantId", id, "customerId"),
  FOREIGN KEY ("tenantId", "branchId")           REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "approvedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "creditNoteTotalChk"    CHECK ("totalAmount" = "valueAmount" + "taxAmount" + "furtherTaxAmount"),
  CONSTRAINT "creditNoteOveruseChk"  CHECK ("appliedAmount" + "refundedAmount" <= "totalAmount"),
  CONSTRAINT "creditNoteApplyChk"    CHECK (treatment <> 'APPLY_TO_INVOICE' OR "invoiceId" IS NOT NULL),
  CONSTRAINT "creditNotePostedChk"   CHECK (status NOT IN ('OPEN','APPLIED') OR "postedAt" IS NOT NULL),
  CONSTRAINT "creditNoteCancelChk"   CHECK (status <> 'CANCELLED' OR "cancelledAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Sales"."CreditNotes"', true);
CREATE INDEX "creditNoteCustomerIdx" ON "Sales"."CreditNotes" ("tenantId", "customerId", "docDate" DESC);
CREATE INDEX "creditNoteInvoiceIdx"  ON "Sales"."CreditNotes" ("tenantId", "invoiceId") WHERE "invoiceId" IS NOT NULL;
CREATE INDEX "creditNoteStatusIdx"   ON "Sales"."CreditNotes" ("tenantId", status, reason);
CREATE INDEX "creditNoteOpenIdx"     ON "Sales"."CreditNotes" ("tenantId", "customerId") WHERE status = 'OPEN';
COMMENT ON TABLE "Sales"."CreditNotes" IS 'Credit note against a sales invoice: reverses revenue + output GST (Sales Tax Return), optional stock back. Treatment decides settlement.';

CREATE TABLE "Sales"."CreditNoteLines" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "creditNoteId"   uuid NOT NULL,
  "lineNo"          smallint NOT NULL CHECK ("lineNo" > 0),
  "invoiceLineId"  uuid,                                                        -- "Item (from invoice)"
  "itemId"          uuid,                                                        -- → Inventory.Products
  description      text NOT NULL,
  "batchId"         uuid,                                                        -- → Inventory.ProductBatches
  "invoicedQty"     numeric(18,3) CHECK ("invoicedQty" >= 0),                     -- "Invoiced" (snapshot)
  "qtyCtn"          numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyCtn" >= 0),
  "qtyLoose"        numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyLoose" >= 0),
  "ctnFactor"       numeric(18,3) NOT NULL DEFAULT 1 CHECK ("ctnFactor" > 0),
  "baseQty"         numeric(18,3) NOT NULL DEFAULT 0 CHECK ("baseQty" >= 0),      -- "Return qty" (0 for pure rate difference)
  rate             numeric(18,4) NOT NULL CHECK (rate >= 0),
  "valueAmount"     numeric(18,2) NOT NULL CHECK ("valueAmount" >= 0),            -- "Amount"
  "taxCodeId"      uuid,
  "taxRate"         numeric(7,4) NOT NULL DEFAULT 0 CHECK ("taxRate" BETWEEN 0 AND 100),
  "taxAmount"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
  "furtherTaxAmount" numeric(18,2) NOT NULL DEFAULT 0 CHECK ("furtherTaxAmount" >= 0),
  "totalAmount"     numeric(18,2) NOT NULL CHECK ("totalAmount" >= 0),
  restock          boolean NOT NULL DEFAULT false,                              -- stock IN to return_warehouse
  "unitCost"        numeric(18,4) CHECK ("unitCost" >= 0),
  "costAmount"      numeric(18,2) NOT NULL DEFAULT 0 CHECK ("costAmount" >= 0),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "creditNoteId", "lineNo"),
  FOREIGN KEY ("tenantId", "creditNoteId")  REFERENCES "Sales"."CreditNotes" ("tenantId", id),
  FOREIGN KEY ("tenantId", "invoiceLineId") REFERENCES "Sales"."SalesInvoiceLines" ("tenantId", id),
  CONSTRAINT "creditNoteLineQtyChk"     CHECK ("baseQty" = "qtyCtn" * "ctnFactor" + "qtyLoose"),
  CONSTRAINT "creditNoteLineReturnChk"  CHECK ("invoicedQty" IS NULL OR "baseQty" <= "invoicedQty"),
  CONSTRAINT "creditNoteLineTotalChk"   CHECK ("totalAmount" = "valueAmount" + "taxAmount" + "furtherTaxAmount"),
  CONSTRAINT "creditNoteLineRestockChk" CHECK (NOT restock OR ("baseQty" > 0 AND "itemId" IS NOT NULL))
);
SELECT "Company"."addStandardTriggers"('"Sales"."CreditNoteLines"', true);
CREATE INDEX "creditNoteLineItemIdx" ON "Sales"."CreditNoteLines" ("tenantId", "itemId");
CREATE INDEX "creditNoteLineInvlIdx" ON "Sales"."CreditNoteLines" ("tenantId", "invoiceLineId") WHERE "invoiceLineId" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- receipt — app/receivables/receipts ("Receive Payment" panel: customer,
-- date, amount received, method Cash/Bank/Cheque/Online, deposit to,
-- reference, WHT deducted, bank charges; list: Received, WHT, Status),
-- "Allocate advance" modal (WHT certificate status), invoice view
-- "Record payment" modal (IBFT / Cheque / Cash / RAAST, memo, e-mail receipt),
-- Sales Voucher "Receive" tender split (one receipt per tender).
-- RCPT-2026-000226.
-- ---------------------------------------------------------------------------
CREATE TABLE "Sales"."CustomerReceipts" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                 text NOT NULL,                                         -- RCPT-2026-000099
  "docDate"               date NOT NULL,                                         -- "Date" / "Payment date"
  "customerId"            uuid NOT NULL,
  "branchId"              uuid,
  method                 text NOT NULL,
  "bankAccountId"        uuid,                                                  -- "Deposit to" Meezan Bank — 0123 (→ BankCash.BankAccounts)
  "cashAccountId"        uuid,                                                  -- "Cash — Lahore HQ" (→ BankCash.CashAccounts)
  "chequeId"              uuid,                                                  -- method CHEQUE → BankCash.Cheques (Cheque #004821)
  reference              text,                                                  -- "IBFT 2610HH77310" / TID
  "currencyCode"          char(3) NOT NULL DEFAULT 'PKR' REFERENCES "Company"."Currencies"(code),
  "fxRate"                numeric(18,6) NOT NULL DEFAULT 1 CHECK ("fxRate" > 0),
  "amountReceived"        numeric(18,2) NOT NULL CHECK ("amountReceived" >= 0),   -- "Amount received *"
  "whtAmount"             numeric(18,2) NOT NULL DEFAULT 0 CHECK ("whtAmount" >= 0),     -- "WHT deducted"
  "whtSection"            text,                                                  -- "153(1)(a)"
  "whtCertificateStatus" text NOT NULL DEFAULT 'NOT_APPLICABLE',
  "whtCertificateNo"     text,
  "whtCertificateDate"   date,
  "bankCharges"           numeric(18,2) NOT NULL DEFAULT 0 CHECK ("bankCharges" >= 0),
  "settledAmount"         numeric(18,2) GENERATED ALWAYS AS ("amountReceived" + "whtAmount" + "bankCharges") STORED,
  "allocatedAmount"       numeric(18,2) NOT NULL DEFAULT 0,                      -- "Allocated" (invoices − credit notes used) — trigger-maintained
  "unallocatedAmount"     numeric(18,2) GENERATED ALWAYS AS ("amountReceived" + "whtAmount" + "bankCharges" - "allocatedAmount") STORED, -- "Unallocated (customer advance)"
  "salesOrderId"         uuid,                                                  -- "Advance vs SO-2026-000094"
  memo                   text,
  "emailReceipt"          boolean NOT NULL DEFAULT true,                         -- "Email receipt to customer"
  status                 text NOT NULL DEFAULT 'UNALLOCATED',
  "postedAt"              timestamptz NOT NULL DEFAULT now(),
  "journalEntryId"       uuid,                                                  -- → Accounting.Vouchers
  "bouncedAt"             timestamptz,
  "bounceReason"          text,
  "bounceJournalEntryId" uuid,                                                 -- reversal on bounce (→ Accounting.Vouchers)
  "voidedAt"              timestamptz,
  "voidReason"            text,
  -- [Full]
  "posShiftId"           uuid,                                                  -- POS tender receipt (→ Sales.PosShifts)
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  UNIQUE ("tenantId", id, "customerId"),
  FOREIGN KEY ("tenantId", "customerId")    REFERENCES "Sales"."Customers" ("tenantId", id),
  FOREIGN KEY ("tenantId", "branchId")      REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "salesOrderId") REFERENCES "Sales"."SalesOrders" ("tenantId", id),
  CONSTRAINT "receiptAmountChk"      CHECK ("amountReceived" + "whtAmount" > 0),
  CONSTRAINT "receiptCashChk"        CHECK (method <> 'CASH' OR "cashAccountId" IS NOT NULL),
  CONSTRAINT "receiptBankChk"        CHECK (method NOT IN ('IBFT','RAAST') OR "bankAccountId" IS NOT NULL),
  CONSTRAINT "receiptOneAccountChk" CHECK ("bankAccountId" IS NULL OR "cashAccountId" IS NULL),
  CONSTRAINT "receiptChequeChk"      CHECK (method = 'CHEQUE' OR "chequeId" IS NULL),
  CONSTRAINT "receiptOverallocChk"   CHECK ("allocatedAmount" BETWEEN 0 AND "amountReceived" + "whtAmount" + "bankCharges"),
  CONSTRAINT "receiptWhtCertChk"    CHECK ("whtAmount" > 0 OR "whtCertificateStatus" = 'NOT_APPLICABLE'),
  CONSTRAINT "receiptBounceChk"      CHECK (status <> 'BOUNCED' OR (method = 'CHEQUE' AND "bouncedAt" IS NOT NULL)),
  CONSTRAINT "receiptVoidChk"        CHECK (status <> 'VOID' OR "voidedAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Sales"."CustomerReceipts"', true);
CREATE INDEX "receiptCustomerIdx" ON "Sales"."CustomerReceipts" ("tenantId", "customerId", "docDate" DESC);
CREATE INDEX "receiptStatusIdx"   ON "Sales"."CustomerReceipts" ("tenantId", status, "docDate" DESC);
CREATE INDEX "receiptBankIdx"     ON "Sales"."CustomerReceipts" ("tenantId", "bankAccountId", "docDate" DESC) WHERE "bankAccountId" IS NOT NULL;
CREATE INDEX "receiptChequeIdx"   ON "Sales"."CustomerReceipts" ("tenantId", "chequeId") WHERE "chequeId" IS NOT NULL;
CREATE INDEX "receiptWhtCertIdx" ON "Sales"."CustomerReceipts" ("tenantId", "whtCertificateStatus") WHERE "whtCertificateStatus" = 'NOT_YET_RECEIVED';
CREATE INDEX "receiptRefTrgmIdx" ON "Sales"."CustomerReceipts" USING gin (reference gin_trgm_ops);
COMMENT ON TABLE "Sales"."CustomerReceipts" IS 'Customer payment. settledAmount = cash received + WHT withheld by customer + bank charges; allocated against invoices / opening balance; remainder is a customer advance.';

-- CustomerReceiptAllocations — "Allocate to open invoices" grid (Invoice, Due,
-- Allocate; open credit notes shown negative), "Auto-allocate (FIFO)",
-- "Apply allocation"; customer statement "Allocated to: Opening balance".
CREATE TABLE "Sales"."CustomerReceiptAllocations" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "receiptId"       uuid NOT NULL,
  "customerId"      uuid NOT NULL,                                               -- same customer enforced by composite FKs
  "targetType"      text NOT NULL,
  "invoiceId"       uuid,
  "creditNoteId"   uuid,                                                        -- open credit consumed (shown −23,600)
  "allocatedAmount" numeric(18,2) NOT NULL CHECK ("allocatedAmount" > 0),
  "allocationDate"  date NOT NULL DEFAULT current_date,
  "isAutoFifo"     boolean NOT NULL DEFAULT false,
  remarks          text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "receiptId", "customerId")     REFERENCES "Sales"."CustomerReceipts" ("tenantId", id, "customerId"),
  FOREIGN KEY ("tenantId", "invoiceId", "customerId")     REFERENCES "Sales"."SalesInvoices" ("tenantId", id, "customerId"),
  FOREIGN KEY ("tenantId", "creditNoteId", "customerId") REFERENCES "Sales"."CreditNotes" ("tenantId", id, "customerId"),
  CONSTRAINT "receiptAllocationTargetChk" CHECK (
       ("targetType" = 'INVOICE'         AND "invoiceId" IS NOT NULL AND "creditNoteId" IS NULL)
    OR ("targetType" = 'CREDIT_NOTE'     AND "creditNoteId" IS NOT NULL AND "invoiceId" IS NULL)
    OR ("targetType" = 'OPENING_BALANCE' AND "invoiceId" IS NULL AND "creditNoteId" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"Sales"."CustomerReceiptAllocations"', true);
CREATE UNIQUE INDEX "receiptAllocationInvUq" ON "Sales"."CustomerReceiptAllocations" ("tenantId", "receiptId", "invoiceId") WHERE "invoiceId" IS NOT NULL;
CREATE UNIQUE INDEX "receiptAllocationCnUq"  ON "Sales"."CustomerReceiptAllocations" ("tenantId", "receiptId", "creditNoteId") WHERE "creditNoteId" IS NOT NULL;
CREATE UNIQUE INDEX "receiptAllocationObUq"  ON "Sales"."CustomerReceiptAllocations" ("tenantId", "receiptId") WHERE "targetType" = 'OPENING_BALANCE';
CREATE INDEX "receiptAllocationInvoiceIdx"  ON "Sales"."CustomerReceiptAllocations" ("tenantId", "invoiceId") WHERE "invoiceId" IS NOT NULL;
CREATE INDEX "receiptAllocationCnIdx"       ON "Sales"."CustomerReceiptAllocations" ("tenantId", "creditNoteId") WHERE "creditNoteId" IS NOT NULL;
CREATE INDEX "receiptAllocationCustomerIdx" ON "Sales"."CustomerReceiptAllocations" ("tenantId", "customerId", "targetType");
COMMENT ON TABLE "Sales"."CustomerReceiptAllocations" IS 'Applies a receipt to invoices / the opening balance; CREDIT_NOTE rows consume an open credit note to fund invoice allocations in the same receipt.';

-- =============================================================================
-- Integrity functions & triggers
-- =============================================================================

-- Freeze selected columns once a document has left its editable statuses.
--   TG_ARGV[0]   comma list of editable statuses ('' = never editable)
--   TG_ARGV[1..] columns that may not change afterwards
-- Settlement columns (paid/applied/balance/status) are never listed, so the
-- refresh functions below can keep them current.
CREATE OR REPLACE FUNCTION "Sales"."triggerFreezeWhenPosted"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vEditable" text[] := string_to_array(TG_ARGV[0], ',');
  "vOld"      jsonb  := to_jsonb(OLD);
  "vNew"      jsonb  := to_jsonb(NEW);
  i          integer;
BEGIN
  IF ("vOld" ->> 'status') = ANY ("vEditable") THEN
    RETURN NEW;
  END IF;
  FOR i IN 1 .. TG_NARGS - 1 LOOP
    IF ("vOld" -> TG_ARGV[i]) IS DISTINCT FROM ("vNew" -> TG_ARGV[i]) THEN
      RAISE EXCEPTION '%.%: column % cannot change once the document is % (use a credit note, reversal or void)',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_ARGV[i], "vOld" ->> 'status'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION "Sales"."triggerFreezeWhenPosted"() IS 'BEFORE UPDATE guard: listed columns are immutable outside the editable statuses.';

-- Lines may be inserted / changed / removed only while the header is in an
-- editable status.  TG_ARGV[0] header table, [1] FK column, [2] editable
-- statuses, [3] optional comma list of columns that posting may still set on
-- a locked line (e.g. unitCost, costAmount, batchId filled at stock issue).
CREATE OR REPLACE FUNCTION "Sales"."triggerLinesEditable"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vRow"     jsonb;
  "vStatus"  text;
  "vSettable" text[] := CASE WHEN TG_NARGS > 3 THEN string_to_array(TG_ARGV[3], ',') ELSE '{}'::text[] END
                       || ARRAY['updatedAt','updatedBy','rowVersion'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    "vRow" := to_jsonb(OLD);
  ELSE
    "vRow" := to_jsonb(NEW);
  END IF;
  IF TG_OP = 'UPDATE' AND (to_jsonb(OLD) ->> TG_ARGV[1]) IS DISTINCT FROM ("vRow" ->> TG_ARGV[1]) THEN
    RAISE EXCEPTION '%.%: a line cannot be moved to another document', TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  EXECUTE format('SELECT status FROM %s WHERE "tenantId" = $1 AND id = $2', TG_ARGV[0])
     INTO "vStatus"
    USING ("vRow" ->> 'tenantId')::uuid, ("vRow" ->> TG_ARGV[1])::uuid;
  IF "vStatus" IS NOT NULL AND NOT ("vStatus" = ANY (string_to_array(TG_ARGV[2], ',')))
     AND NOT (TG_OP = 'UPDATE' AND (to_jsonb(OLD) - "vSettable") = ("vRow" - "vSettable")) THEN
    RAISE EXCEPTION '%.%: lines are locked because the document is %', TG_TABLE_SCHEMA, TG_TABLE_NAME, "vStatus"
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

-- Recompute paid / credited / balance / status of one invoice.
CREATE OR REPLACE FUNCTION "Sales"."refreshSalesInvoiceSettlement"("pTenant" uuid, "pInvoice" uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  "vInv"    record;
  "vPaid"   numeric(18,2);
  "vCred"   numeric(18,2);
  "vBal"    numeric(18,2);
  "vStatus" text;
BEGIN
  IF "pInvoice" IS NULL THEN RETURN; END IF;
  SELECT i.status, i."netAmount", i."paidAmount", i."creditAppliedAmount"
    INTO "vInv"
    FROM "Sales"."SalesInvoices" i
   WHERE i."tenantId" = "pTenant" AND i.id = "pInvoice"
   FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(sum(a."allocatedAmount"), 0) INTO "vPaid"
    FROM "Sales"."CustomerReceiptAllocations" a
    JOIN "Sales"."CustomerReceipts" r ON r."tenantId" = a."tenantId" AND r.id = a."receiptId"
   WHERE a."tenantId" = "pTenant" AND a."invoiceId" = "pInvoice"
     AND r.status NOT IN ('BOUNCED','VOID');

  SELECT COALESCE(sum(c."totalAmount"), 0) INTO "vCred"
    FROM "Sales"."CreditNotes" c
   WHERE c."tenantId" = "pTenant" AND c."invoiceId" = "pInvoice"
     AND c.treatment = 'APPLY_TO_INVOICE' AND c.status = 'APPLIED';

  "vBal" := "vInv"."netAmount" - "vPaid" - "vCred";
  "vStatus" := CASE
                WHEN "vInv".status IN ('DRAFT','VOID') THEN "vInv".status
                WHEN "vBal" <= 0                        THEN 'PAID'
                WHEN "vPaid" + "vCred" > 0               THEN 'PARTIALLY_PAID'
                ELSE 'POSTED' END;

  IF "vPaid" IS DISTINCT FROM "vInv"."paidAmount"
     OR "vCred" IS DISTINCT FROM "vInv"."creditAppliedAmount"
     OR "vStatus" IS DISTINCT FROM "vInv".status THEN
    UPDATE "Sales"."SalesInvoices"
       SET "paidAmount" = "vPaid", "creditAppliedAmount" = "vCred", status = "vStatus"
     WHERE "tenantId" = "pTenant" AND id = "pInvoice";
  END IF;
END $$;

-- Recompute applied / balance (and OPEN ↔ APPLIED for customer credit) of one credit note.
CREATE OR REPLACE FUNCTION "Sales"."refreshCreditNoteSettlement"("pTenant" uuid, "pCn" uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  "vCn"      record;
  "vAlloc"   numeric(18,2);
  "vApplied" numeric(18,2);
  "vStatus"  text;
BEGIN
  IF "pCn" IS NULL THEN RETURN; END IF;
  SELECT c.status, c.treatment, c."totalAmount", c."appliedAmount", c."refundedAmount"
    INTO "vCn"
    FROM "Sales"."CreditNotes" c
   WHERE c."tenantId" = "pTenant" AND c.id = "pCn"
   FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(sum(a."allocatedAmount"), 0) INTO "vAlloc"
    FROM "Sales"."CustomerReceiptAllocations" a
    JOIN "Sales"."CustomerReceipts" r ON r."tenantId" = a."tenantId" AND r.id = a."receiptId"
   WHERE a."tenantId" = "pTenant" AND a."creditNoteId" = "pCn"
     AND r.status NOT IN ('BOUNCED','VOID');

  "vApplied" := "vAlloc" + CASE WHEN "vCn".treatment = 'APPLY_TO_INVOICE' AND "vCn".status = 'APPLIED'
                              THEN "vCn"."totalAmount" ELSE 0 END;
  "vStatus" := CASE
                WHEN "vCn".treatment = 'KEEP_AS_CREDIT' AND "vCn".status IN ('OPEN','APPLIED') THEN
                  CASE WHEN "vCn"."totalAmount" - "vApplied" - "vCn"."refundedAmount" = 0 THEN 'APPLIED' ELSE 'OPEN' END
                ELSE "vCn".status END;

  IF "vApplied" IS DISTINCT FROM "vCn"."appliedAmount" OR "vStatus" IS DISTINCT FROM "vCn".status THEN
    UPDATE "Sales"."CreditNotes"
       SET "appliedAmount" = "vApplied",
           status = "vStatus"
     WHERE "tenantId" = "pTenant" AND id = "pCn";
  END IF;
END $$;

-- Recompute allocated / unallocated / status of one receipt.
CREATE OR REPLACE FUNCTION "Sales"."refreshCustomerReceiptAllocation"("pTenant" uuid, "pReceipt" uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  "vRc"     record;
  "vAlloc"  numeric(18,2);
  "vStatus" text;
BEGIN
  IF "pReceipt" IS NULL THEN RETURN; END IF;
  SELECT r.status, r."settledAmount", r."allocatedAmount"
    INTO "vRc"
    FROM "Sales"."CustomerReceipts" r
   WHERE r."tenantId" = "pTenant" AND r.id = "pReceipt"
   FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(sum(CASE WHEN a."targetType" = 'CREDIT_NOTE' THEN -a."allocatedAmount"
                           ELSE a."allocatedAmount" END), 0)
    INTO "vAlloc"
    FROM "Sales"."CustomerReceiptAllocations" a
   WHERE a."tenantId" = "pTenant" AND a."receiptId" = "pReceipt";

  "vStatus" := CASE
                WHEN "vRc".status IN ('BOUNCED','VOID') THEN "vRc".status
                WHEN "vAlloc" <= 0                       THEN 'UNALLOCATED'
                WHEN "vAlloc" >= "vRc"."settledAmount"     THEN 'ALLOCATED'
                ELSE 'PARTLY_ALLOCATED' END;

  IF "vAlloc" IS DISTINCT FROM "vRc"."allocatedAmount" OR "vStatus" IS DISTINCT FROM "vRc".status THEN
    UPDATE "Sales"."CustomerReceipts"
       SET "allocatedAmount" = "vAlloc",
           status = "vStatus"
     WHERE "tenantId" = "pTenant" AND id = "pReceipt";
  END IF;
END $$;

-- Validates an allocation before it is written.
CREATE OR REPLACE FUNCTION "Sales"."triggerReceiptAllocationCheck"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vStatus"    text;
  "vTreatment" text;
BEGIN
  SELECT r.status INTO "vStatus" FROM "Sales"."CustomerReceipts" r
   WHERE r."tenantId" = NEW."tenantId" AND r.id = NEW."receiptId";
  IF "vStatus" IN ('BOUNCED','VOID') THEN
    RAISE EXCEPTION 'Receipt is %: it cannot be allocated', "vStatus" USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."targetType" = 'INVOICE' THEN
    SELECT i.status INTO "vStatus" FROM "Sales"."SalesInvoices" i
     WHERE i."tenantId" = NEW."tenantId" AND i.id = NEW."invoiceId";
    IF "vStatus" NOT IN ('POSTED','PARTIALLY_PAID','PAID') THEN
      RAISE EXCEPTION 'Only posted invoices can be allocated (invoice is %)', "vStatus" USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW."targetType" = 'CREDIT_NOTE' THEN
    SELECT c.status, c.treatment INTO "vStatus", "vTreatment" FROM "Sales"."CreditNotes" c
     WHERE c."tenantId" = NEW."tenantId" AND c.id = NEW."creditNoteId";
    IF "vTreatment" <> 'KEEP_AS_CREDIT' OR "vStatus" NOT IN ('OPEN','APPLIED') THEN
      RAISE EXCEPTION 'Only open customer-credit notes can be used in a receipt' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Keeps receipt, invoice and credit-note settlement in step with allocations.
CREATE OR REPLACE FUNCTION "Sales"."triggerReceiptAllocationSync"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM "Sales"."refreshCustomerReceiptAllocation"(OLD."tenantId", OLD."receiptId");
    PERFORM "Sales"."refreshSalesInvoiceSettlement"(OLD."tenantId", OLD."invoiceId");
    PERFORM "Sales"."refreshCreditNoteSettlement"(OLD."tenantId", OLD."creditNoteId");
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM "Sales"."refreshCustomerReceiptAllocation"(NEW."tenantId", NEW."receiptId");
    PERFORM "Sales"."refreshSalesInvoiceSettlement"(NEW."tenantId", NEW."invoiceId");
    PERFORM "Sales"."refreshCreditNoteSettlement"(NEW."tenantId", NEW."creditNoteId");
  END IF;
  RETURN NULL;
END $$;

-- A receipt that bounces / is voided stops settling its invoices (and frees
-- the credit notes it consumed); reinstating it settles them again.
CREATE OR REPLACE FUNCTION "Sales"."triggerReceiptStatusSync"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  a record;
BEGIN
  FOR a IN SELECT DISTINCT x."invoiceId", x."creditNoteId"
             FROM "Sales"."CustomerReceiptAllocations" x
            WHERE x."tenantId" = NEW."tenantId" AND x."receiptId" = NEW.id LOOP
    PERFORM "Sales"."refreshSalesInvoiceSettlement"(NEW."tenantId", a."invoiceId");
    PERFORM "Sales"."refreshCreditNoteSettlement"(NEW."tenantId", a."creditNoteId");
  END LOOP;
  RETURN NULL;
END $$;

-- Credit note status / amounts changed → its settlement and its invoice.
CREATE OR REPLACE FUNCTION "Sales"."triggerCreditNoteSync"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM "Sales"."refreshCreditNoteSettlement"(NEW."tenantId", NEW.id);
  PERFORM "Sales"."refreshSalesInvoiceSettlement"(NEW."tenantId", NEW."invoiceId");
  IF TG_OP = 'UPDATE' AND OLD."invoiceId" IS DISTINCT FROM NEW."invoiceId" THEN
    PERFORM "Sales"."refreshSalesInvoiceSettlement"(OLD."tenantId", OLD."invoiceId");
  END IF;
  RETURN NULL;
END $$;

-- Wiring -----------------------------------------------------------------------

CREATE TRIGGER "invoiceFreeze" BEFORE UPDATE ON "Sales"."SalesInvoices"
  FOR EACH ROW EXECUTE FUNCTION "Sales"."triggerFreezeWhenPosted"(
    'DRAFT', 'docNo', 'channel', 'docDate', 'customerId', 'branchId', 'warehouseId',
    'paymentTerms', 'dueDate', 'currencyCode', 'fxRate', 'grossAmount', 'discountAmount',
    'taxableAmount', 'taxAmount', 'furtherTaxAmount', 'advanceTaxAmount', 'fbrServiceFee', 'netAmount');

CREATE TRIGGER "invoiceLineEditable" BEFORE INSERT OR UPDATE OR DELETE ON "Sales"."SalesInvoiceLines"
  FOR EACH ROW EXECUTE FUNCTION "Sales"."triggerLinesEditable"('"Sales"."SalesInvoices"', 'invoiceId', 'DRAFT',
    'unitCost,costAmount,batchId,expiryDate');

CREATE TRIGGER "creditNoteFreeze" BEFORE UPDATE ON "Sales"."CreditNotes"
  FOR EACH ROW EXECUTE FUNCTION "Sales"."triggerFreezeWhenPosted"(
    'DRAFT,PENDING_APPROVAL', 'docNo', 'docDate', 'customerId', 'invoiceId', 'reason', 'treatment',
    'valueAmount', 'taxAmount', 'furtherTaxAmount', 'totalAmount', 'costAmount');

CREATE TRIGGER "creditNoteLineEditable" BEFORE INSERT OR UPDATE OR DELETE ON "Sales"."CreditNoteLines"
  FOR EACH ROW EXECUTE FUNCTION "Sales"."triggerLinesEditable"('"Sales"."CreditNotes"', 'creditNoteId', 'DRAFT,PENDING_APPROVAL');

CREATE TRIGGER "creditNoteSync" AFTER INSERT OR UPDATE OF status, treatment, "totalAmount", "refundedAmount", "invoiceId"
  ON "Sales"."CreditNotes"
  FOR EACH ROW EXECUTE FUNCTION "Sales"."triggerCreditNoteSync"();

CREATE TRIGGER "receiptFreeze" BEFORE UPDATE ON "Sales"."CustomerReceipts"
  FOR EACH ROW EXECUTE FUNCTION "Sales"."triggerFreezeWhenPosted"(
    '', 'docNo', 'docDate', 'customerId', 'method', 'bankAccountId', 'cashAccountId',
    'currencyCode', 'fxRate', 'amountReceived', 'whtAmount', 'bankCharges');

CREATE TRIGGER "receiptStatusSync" AFTER UPDATE OF status ON "Sales"."CustomerReceipts"
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status
        AND (OLD.status IN ('BOUNCED','VOID') OR NEW.status IN ('BOUNCED','VOID')))
  EXECUTE FUNCTION "Sales"."triggerReceiptStatusSync"();

CREATE TRIGGER "receiptAllocationCheck" BEFORE INSERT OR UPDATE ON "Sales"."CustomerReceiptAllocations"
  FOR EACH ROW EXECUTE FUNCTION "Sales"."triggerReceiptAllocationCheck"();

CREATE TRIGGER "receiptAllocationSync" AFTER INSERT OR UPDATE OR DELETE ON "Sales"."CustomerReceiptAllocations"
  FOR EACH ROW EXECUTE FUNCTION "Sales"."triggerReceiptAllocationSync"();

-- #############################################################################
-- FULL-ONLY SECTION
-- Everything below is absent from erp-basic. Upgrade = run the [Full] column
-- additions (ALTER TABLE … ADD COLUMN, widened CHECKs) + this section.
-- #############################################################################

-- ---------------------------------------------------------------------------
-- CustomerAddresses — multiple bill-to / ship-to points per customer
-- (New Sales Invoice "Ship to: IT Store, Block C"; Customer detail address;
-- Sales Voucher address card). Basic keeps one billing + one shipping text.
-- ---------------------------------------------------------------------------
CREATE TABLE "Sales"."CustomerAddresses" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "customerId"      uuid NOT NULL,
  "addressType"     text NOT NULL DEFAULT 'SHIPPING',
  label            text NOT NULL,                                               -- "IT Store, Block C"
  "addressLine"     text NOT NULL,
  area             text,
  city             text,
  province         text,
  "contactName"     text,
  "contactPhone"    text,
  "isDefault"       boolean NOT NULL DEFAULT false,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "customerId") REFERENCES "Sales"."Customers" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Sales"."CustomerAddresses"');
CREATE INDEX "customerAddressCustomerIdx" ON "Sales"."CustomerAddresses" ("tenantId", "customerId");
CREATE UNIQUE INDEX "customerAddressOneDefault" ON "Sales"."CustomerAddresses" ("tenantId", "customerId", "addressType")
  WHERE "isDefault" AND "deletedAt" IS NULL;
COMMENT ON TABLE "Sales"."CustomerAddresses" IS 'Additional billing / shipping addresses of a customer. Invoices snapshot the text and keep shipToAddressId.';

-- ---------------------------------------------------------------------------
-- PriceListQuantityBreaks — app/sales/price-lists "Quantity breaks" tab
-- (src/9A-company-plus.js QB: Tier, Min qty, Max qty / "and above",
-- Unit price; "Applies on top of the customer's price list").
-- ---------------------------------------------------------------------------
CREATE TABLE "Sales"."PriceListQuantityBreaks" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "priceListId"    uuid,                                                        -- NULL = every price list
  "itemId"          uuid NOT NULL,                                               -- → Inventory.Products (fk file)
  "tierNo"          smallint NOT NULL CHECK ("tierNo" BETWEEN 1 AND 20),          -- T1, T2 …
  "minQty"          numeric(18,3) NOT NULL CHECK ("minQty" > 0),
  "maxQty"          numeric(18,3),                                               -- NULL = "and above"
  "unitPrice"       numeric(18,4) NOT NULL CHECK ("unitPrice" >= 0),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE NULLS NOT DISTINCT ("tenantId", "priceListId", "itemId", "tierNo"),
  FOREIGN KEY ("tenantId", "priceListId") REFERENCES "Sales"."PriceLists" ("tenantId", id),
  CONSTRAINT "quantityBreakRangeChk" CHECK ("maxQty" IS NULL OR "maxQty" >= "minQty"),
  CONSTRAINT "quantityBreakNoOverlap" EXCLUDE USING gist (
    "tenantId" WITH =,
    "itemId" WITH =,
    (COALESCE("priceListId", '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    numrange("minQty", "maxQty", '[]') WITH &&)
);
SELECT "Company"."addStandardTriggers"('"Sales"."PriceListQuantityBreaks"', true);
CREATE INDEX "quantityBreakItemIdx" ON "Sales"."PriceListQuantityBreaks" ("tenantId", "itemId");
COMMENT ON TABLE "Sales"."PriceListQuantityBreaks" IS 'Quantity-break price slabs per item (optionally per price list). Margin guard (never below cost, min 5%) is an application rule.';

-- ---------------------------------------------------------------------------
-- scheme — app/sales/price-lists "Schemes" tab + "New scheme" drawer
-- (src/9A-company-plus.js SCHEMES: SC-014 "Buy 10 get 1 free", types Free
-- goods / Invoice discount / Bundle price / Line discount / Service /
-- Settlement; From → To; eligible groups; Budget cap; Max uses per customer;
-- Times applied; Discount given; Budget used %). Live / Off / Scheduled /
-- Ended badges are derived from isActive + dates.
-- ---------------------------------------------------------------------------
CREATE TABLE "Sales"."SalesSchemes" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                   text NOT NULL CHECK (code ~ '^SC-\d{3,6}$'),           -- SC-014
  name                   text NOT NULL,                                         -- "Buy 10 get 1 free"
  description            text,                                                  -- "Shan Biryani Masala 60g"
  "schemeType"            text NOT NULL,
  "validFrom"             date NOT NULL,
  "validTo"               date NOT NULL,
  "isActive"              boolean NOT NULL DEFAULT true,                         -- switch on the card
  "buyQty"                numeric(18,3) CHECK ("buyQty" > 0),                     -- buy 10 …
  "freeQty"               numeric(18,3) CHECK ("freeQty" > 0),                    -- … get 1 free
  "discountPct"           numeric(7,4) CHECK ("discountPct" > 0 AND "discountPct" <= 100),
  "discountAmount"        numeric(18,2) CHECK ("discountAmount" > 0),             -- "Flat Rs 50 per carton"
  "minInvoiceAmount"     numeric(18,2) CHECK ("minInvoiceAmount" >= 0),         -- "over Rs 100,000"
  "minLineQty"           numeric(18,3) CHECK ("minLineQty" > 0),                -- "min 500 pcs"
  "bundlePrice"           numeric(18,2) CHECK ("bundlePrice" >= 0),
  "settlementDays"        smallint CHECK ("settlementDays" > 0),                  -- "Paid within 10 days"
  "appliesToAll"         boolean NOT NULL DEFAULT false,                        -- "All customers"
  "budgetCap"             numeric(18,2) CHECK ("budgetCap" > 0),
  "maxUsesPerCustomer"  integer CHECK ("maxUsesPerCustomer" > 0),
  "usedCount"             integer NOT NULL DEFAULT 0 CHECK ("usedCount" >= 0),    -- "Times applied"
  "valueGiven"            numeric(18,2) NOT NULL DEFAULT 0 CHECK ("valueGiven" >= 0), -- "Discount given"
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  "deletedAt"             timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code),
  CONSTRAINT "schemeDatesChk" CHECK ("validTo" >= "validFrom"),
  CONSTRAINT "schemeBudgetChk" CHECK ("budgetCap" IS NULL OR "valueGiven" <= "budgetCap"),
  CONSTRAINT "schemeTypeFieldsChk" CHECK (
       ("schemeType" = 'FREE_GOODS'       AND "buyQty" IS NOT NULL AND "freeQty" IS NOT NULL)
    OR ("schemeType" = 'INVOICE_DISCOUNT' AND "minInvoiceAmount" IS NOT NULL AND num_nonnulls("discountPct", "discountAmount") = 1)
    OR ("schemeType" = 'BUNDLE_PRICE'     AND "bundlePrice" IS NOT NULL)
    OR ("schemeType" = 'LINE_DISCOUNT'    AND num_nonnulls("discountPct", "discountAmount") = 1)
    OR ("schemeType" = 'SETTLEMENT'       AND "settlementDays" IS NOT NULL AND "discountPct" IS NOT NULL)
    OR ("schemeType" = 'SERVICE'))
);
SELECT "Company"."addStandardTriggers"('"Sales"."SalesSchemes"', true);
CREATE INDEX "schemeLiveIdx" ON "Sales"."SalesSchemes" ("tenantId", "validFrom", "validTo") WHERE "isActive" AND "deletedAt" IS NULL;
COMMENT ON TABLE "Sales"."SalesSchemes" IS 'Trade promotion. Budget used % = valueGiven / budgetCap. Status badge derived: Ended (validTo < today), Scheduled (validFrom > today), Live / Off (isActive).';

-- SalesSchemeItems — the items a scheme buys / gives / bundles / discounts.
CREATE TABLE "Sales"."SalesSchemeItems" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "schemeId"        uuid NOT NULL,
  "itemId"          uuid NOT NULL,                                               -- → Inventory.Products (fk file)
  "itemRole"        text NOT NULL,
  qty              numeric(18,3) CHECK (qty > 0),                               -- bundle composition: "3 × Shan Masala"
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "schemeId", "itemId", "itemRole"),
  FOREIGN KEY ("tenantId", "schemeId") REFERENCES "Sales"."SalesSchemes" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Sales"."SalesSchemeItems"');
CREATE INDEX "schemeItemItemIdx" ON "Sales"."SalesSchemeItems" ("tenantId", "itemId");

-- SalesSchemeEligibilities — "Eligible groups" (Retail Chain, Distributors …),
-- optionally a single customer or a price tier.
CREATE TABLE "Sales"."SalesSchemeEligibilities" (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "schemeId"          uuid NOT NULL,
  "customerGroupId"  uuid,
  "customerId"        uuid,
  "priceTier"         text,
  "isExcluded"        boolean NOT NULL DEFAULT false,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "createdBy"         uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedBy"         uuid,
  "rowVersion"        integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE NULLS NOT DISTINCT ("tenantId", "schemeId", "customerGroupId", "customerId", "priceTier"),
  FOREIGN KEY ("tenantId", "schemeId")         REFERENCES "Sales"."SalesSchemes" ("tenantId", id),
  FOREIGN KEY ("tenantId", "customerGroupId") REFERENCES "Sales"."CustomerGroups" ("tenantId", id),
  FOREIGN KEY ("tenantId", "customerId")       REFERENCES "Sales"."Customers" ("tenantId", id),
  CONSTRAINT "schemeEligibilityOneChk" CHECK (num_nonnulls("customerGroupId", "customerId", "priceTier") = 1)
);
SELECT "Company"."addStandardTriggers"('"Sales"."SalesSchemeEligibilities"');

-- ---------------------------------------------------------------------------
-- DeliveryChallans — app/sales/challans (src/43-sales-docs.html +
-- src/93-sales-docs.js DC: Challan #, Sales Order, Customer, Qty,
-- Vehicle · Driver, Progress, Status Packed → Dispatched → Delivered →
-- Invoiced; "New delivery challan" drawer: Sales order *, Challan date,
-- From warehouse, Vehicle no *, Driver, lines Ordered / Delivered / Pending /
-- Deliver now). DC-2026-000237.
-- ---------------------------------------------------------------------------
CREATE TABLE "Sales"."DeliveryChallans" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"              text NOT NULL,                                            -- DC-2026-000237
  "docDate"            date NOT NULL,                                            -- "Challan date"
  "salesOrderId"      uuid NOT NULL,
  "customerId"         uuid NOT NULL,
  "branchId"           uuid,
  "warehouseId"        uuid NOT NULL,                                            -- "From warehouse" (→ Inventory.Warehouses)
  "vehicleId"          uuid,                                                     -- → Distribution.Vans (fk file)
  "vehicleNo"          text NOT NULL,                                            -- "Vehicle no *" LES-4471
  "driverEmployeeId"  uuid,                                                     -- "Driver" (→ HumanResources.Employees)
  "driverName"         text,
  "deliverySlot"       text,
  eta                 timestamptz,                                              -- "ETA 2 Oct, 11:00"
  "totalQty"           numeric(18,3) NOT NULL DEFAULT 0 CHECK ("totalQty" >= 0),  -- "Qty"
  "costAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("costAmount" >= 0),
  status              text NOT NULL DEFAULT 'PACKED',
  "dispatchedAt"       timestamptz,
  "deliveredAt"        timestamptz,
  "receivedBy"         text,                                                     -- proof of delivery
  "invoiceId"          uuid,                                                     -- "Convert to invoice"
  "journalEntryId"    uuid,                                                     -- GDNI posting at dispatch (→ Accounting.Vouchers)
  remarks             text,
  "cancelledAt"        timestamptz,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  FOREIGN KEY ("tenantId", "salesOrderId") REFERENCES "Sales"."SalesOrders" ("tenantId", id),
  FOREIGN KEY ("tenantId", "customerId")    REFERENCES "Sales"."Customers" ("tenantId", id),
  FOREIGN KEY ("tenantId", "branchId")      REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "invoiceId", "customerId") REFERENCES "Sales"."SalesInvoices" ("tenantId", id, "customerId"),
  CONSTRAINT "deliveryChallanDispatchChk" CHECK (status NOT IN ('DISPATCHED','DELIVERED','INVOICED') OR "dispatchedAt" IS NOT NULL),
  CONSTRAINT "deliveryChallanDeliverChk"  CHECK (status NOT IN ('DELIVERED','INVOICED') OR "deliveredAt" IS NOT NULL),
  CONSTRAINT "deliveryChallanInvoiceChk"  CHECK ((status = 'INVOICED') = ("invoiceId" IS NOT NULL)),
  CONSTRAINT "deliveryChallanCancelChk"   CHECK (status <> 'CANCELLED' OR "cancelledAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Sales"."DeliveryChallans"', true);
CREATE INDEX "deliveryChallanSoIdx"       ON "Sales"."DeliveryChallans" ("tenantId", "salesOrderId");
CREATE INDEX "deliveryChallanStatusIdx"   ON "Sales"."DeliveryChallans" ("tenantId", status, "docDate" DESC);
CREATE INDEX "deliveryChallanCustomerIdx" ON "Sales"."DeliveryChallans" ("tenantId", "customerId", "docDate" DESC);
CREATE INDEX "deliveryChallanVehicleIdx"  ON "Sales"."DeliveryChallans" ("tenantId", "vehicleNo", "docDate" DESC);
COMMENT ON TABLE "Sales"."DeliveryChallans" IS 'Goods dispatched against a sales order. Stock leaves at DISPATCHED (Dr GDNI / Cr Inventory); the invoice made from it does not move stock again.';

CREATE TABLE "Sales"."DeliveryChallanLines" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "deliveryChallanId"  uuid NOT NULL,
  "lineNo"              smallint NOT NULL CHECK ("lineNo" > 0),
  "salesOrderLineId"  uuid NOT NULL,
  "itemId"              uuid NOT NULL,                                           -- → Inventory.Products
  "batchId"             uuid,                                                    -- → Inventory.ProductBatches (FEFO)
  "orderedQty"          numeric(18,3) NOT NULL CHECK ("orderedQty" > 0),          -- "Ordered" snapshot
  "previouslyDeliveredQty" numeric(18,3) NOT NULL DEFAULT 0 CHECK ("previouslyDeliveredQty" >= 0), -- "Delivered"
  "qtyCtn"              numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyCtn" >= 0),
  "qtyLoose"            numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyLoose" >= 0),
  "ctnFactor"           numeric(18,3) NOT NULL DEFAULT 1 CHECK ("ctnFactor" > 0),
  "baseQty"             numeric(18,3) NOT NULL CHECK ("baseQty" > 0),             -- "Deliver now"
  "unitCost"            numeric(18,4) CHECK ("unitCost" >= 0),
  "costAmount"          numeric(18,2) NOT NULL DEFAULT 0 CHECK ("costAmount" >= 0),
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "deliveryChallanId", "lineNo"),
  FOREIGN KEY ("tenantId", "deliveryChallanId") REFERENCES "Sales"."DeliveryChallans" ("tenantId", id),
  FOREIGN KEY ("tenantId", "salesOrderLineId") REFERENCES "Sales"."SalesOrderLines" ("tenantId", id),
  CONSTRAINT "deliveryChallanLineQtyChk"     CHECK ("baseQty" = "qtyCtn" * "ctnFactor" + "qtyLoose"),
  CONSTRAINT "deliveryChallanLinePendingChk" CHECK ("baseQty" <= "orderedQty" - "previouslyDeliveredQty")
);
SELECT "Company"."addStandardTriggers"('"Sales"."DeliveryChallanLines"', true);
CREATE INDEX "deliveryChallanLineSolIdx"  ON "Sales"."DeliveryChallanLines" ("tenantId", "salesOrderLineId");
CREATE INDEX "deliveryChallanLineItemIdx" ON "Sales"."DeliveryChallanLines" ("tenantId", "itemId");

-- ---------------------------------------------------------------------------
-- SalesReturns — app/sales/returns (src/43-sales-docs.html +
-- src/93-sales-docs.js SR: Search Invoice, Return Date, Return Type Against
-- invoice / Without invoice / Replacement, Return #, Invoice #, Remarks
-- (500 chars), Booker, Deliveryman, Summary items / qty / discount / total;
-- "Previous Sales Returns" Draft / Posted / Cancelled). Posting raises a
-- credit note (CreditNotes.salesReturnId). SR-2026-000012.
-- ---------------------------------------------------------------------------
CREATE TABLE "Sales"."SalesReturns" (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"               uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                  text NOT NULL,                                        -- SR-2026-000012
  "docDate"                date NOT NULL,                                        -- "Return Date"
  "returnType"             text NOT NULL DEFAULT 'AGAINST_INVOICE',
  "customerId"             uuid NOT NULL,
  "invoiceId"              uuid,                                                 -- "Invoice #"
  "branchId"               uuid,
  "warehouseId"            uuid NOT NULL,                                        -- receiving warehouse (→ Inventory.Warehouses)
  "bookerEmployeeId"      uuid,                                                 -- → HumanResources.Employees
  "deliverymanEmployeeId" uuid,                                                 -- → HumanResources.Employees
  remarks                 text CHECK (remarks IS NULL OR length(remarks) <= 500),
  "totalItems"             integer NOT NULL DEFAULT 0 CHECK ("totalItems" >= 0),  -- "Total Items"
  "totalQty"               numeric(18,3) NOT NULL DEFAULT 0 CHECK ("totalQty" >= 0),
  "grossAmount"            numeric(18,2) NOT NULL DEFAULT 0 CHECK ("grossAmount" >= 0),
  "discountAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0), -- "Total Discount"
  "valueAmount"            numeric(18,2) NOT NULL DEFAULT 0 CHECK ("valueAmount" >= 0),
  "taxAmount"              numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
  "totalAmount"            numeric(18,2) NOT NULL DEFAULT 0 CHECK ("totalAmount" >= 0),   -- "Net return amount (incl. GST)"
  "costAmount"             numeric(18,2) NOT NULL DEFAULT 0 CHECK ("costAmount" >= 0),
  status                  text NOT NULL DEFAULT 'DRAFT',
  "creditNoteId"          uuid,                                                 -- credit note raised on posting
  "replacementInvoiceId"  uuid,                                                 -- REPLACEMENT: goods re-issued
  "postedAt"               timestamptz,
  "journalEntryId"        uuid,                                                 -- stock / write-off entry (→ Accounting.Vouchers)
  "cancelledAt"            timestamptz,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "createdBy"              uuid,
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedBy"              uuid,
  "rowVersion"             integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  FOREIGN KEY ("tenantId", "customerId")            REFERENCES "Sales"."Customers" ("tenantId", id),
  FOREIGN KEY ("tenantId", "invoiceId", "customerId") REFERENCES "Sales"."SalesInvoices" ("tenantId", id, "customerId"),
  FOREIGN KEY ("tenantId", "branchId")              REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "creditNoteId")         REFERENCES "Sales"."CreditNotes" ("tenantId", id),
  FOREIGN KEY ("tenantId", "replacementInvoiceId") REFERENCES "Sales"."SalesInvoices" ("tenantId", id),
  CONSTRAINT "salesReturnInvoiceChk" CHECK ("returnType" = 'WITHOUT_INVOICE' OR "invoiceId" IS NOT NULL),
  CONSTRAINT "salesReturnValueChk"   CHECK ("valueAmount" = "grossAmount" - "discountAmount"),
  CONSTRAINT "salesReturnTotalChk"   CHECK ("totalAmount" = "valueAmount" + "taxAmount"),
  CONSTRAINT "salesReturnPostedChk"  CHECK (status <> 'POSTED' OR "postedAt" IS NOT NULL),
  CONSTRAINT "salesReturnCancelChk"  CHECK (status <> 'CANCELLED' OR "cancelledAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Sales"."SalesReturns"', true);
CREATE INDEX "salesReturnCustomerIdx" ON "Sales"."SalesReturns" ("tenantId", "customerId", "docDate" DESC);
CREATE INDEX "salesReturnInvoiceIdx"  ON "Sales"."SalesReturns" ("tenantId", "invoiceId") WHERE "invoiceId" IS NOT NULL;
CREATE INDEX "salesReturnStatusIdx"   ON "Sales"."SalesReturns" ("tenantId", status, "docDate" DESC);
COMMENT ON TABLE "Sales"."SalesReturns" IS 'Physical goods return. Line disposition drives stock (RESTOCK / QUARANTINE / WRITE_OFF); the AR + GST side is the credit note it raises.';

-- SalesReturnLines — "Return Items" grid (Product, Pack, Batch / Expiry,
-- Rate, Sold, Return Qty, % Disc, Discount, Amount, Reason, Disposition).
CREATE TABLE "Sales"."SalesReturnLines" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "salesReturnId"  uuid NOT NULL,
  "lineNo"          smallint NOT NULL CHECK ("lineNo" > 0),
  "invoiceLineId"  uuid,
  "itemId"          uuid NOT NULL,                                               -- → Inventory.Products
  "packLabel"       text,
  "batchId"         uuid,                                                        -- → Inventory.ProductBatches
  "expiryDate"      date,
  rate             numeric(18,4) NOT NULL CHECK (rate >= 0),
  "soldQty"         numeric(18,3) CHECK ("soldQty" >= 0),                         -- "Sold"
  "qtyCtn"          numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyCtn" >= 0),
  "qtyLoose"        numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyLoose" >= 0),
  "ctnFactor"       numeric(18,3) NOT NULL DEFAULT 1 CHECK ("ctnFactor" > 0),
  "baseQty"         numeric(18,3) NOT NULL CHECK ("baseQty" > 0),                 -- "Return Qty"
  "grossAmount"     numeric(18,2) NOT NULL CHECK ("grossAmount" >= 0),
  "discountPct"     numeric(7,4) NOT NULL DEFAULT 0 CHECK ("discountPct" BETWEEN 0 AND 100),
  "discountAmount"  numeric(18,2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),
  "valueAmount"     numeric(18,2) NOT NULL CHECK ("valueAmount" >= 0),            -- "Amount"
  "taxCodeId"      uuid,
  "taxRate"         numeric(7,4) NOT NULL DEFAULT 0 CHECK ("taxRate" BETWEEN 0 AND 100),
  "taxAmount"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
  "totalAmount"     numeric(18,2) NOT NULL CHECK ("totalAmount" >= 0),
  reason           text NOT NULL,
  disposition      text NOT NULL,
  "unitCost"        numeric(18,4) CHECK ("unitCost" >= 0),
  "costAmount"      numeric(18,2) NOT NULL DEFAULT 0 CHECK ("costAmount" >= 0),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "salesReturnId", "lineNo"),
  FOREIGN KEY ("tenantId", "salesReturnId") REFERENCES "Sales"."SalesReturns" ("tenantId", id),
  FOREIGN KEY ("tenantId", "invoiceLineId") REFERENCES "Sales"."SalesInvoiceLines" ("tenantId", id),
  CONSTRAINT "salesReturnLineQtyChk"   CHECK ("baseQty" = "qtyCtn" * "ctnFactor" + "qtyLoose"),
  CONSTRAINT "salesReturnLineSoldChk"  CHECK ("soldQty" IS NULL OR "baseQty" <= "soldQty"),   -- "cannot exceed the quantity sold"
  CONSTRAINT "salesReturnLineValueChk" CHECK ("valueAmount" = "grossAmount" - "discountAmount"),
  CONSTRAINT "salesReturnLineTotalChk" CHECK ("totalAmount" = "valueAmount" + "taxAmount")
);
SELECT "Company"."addStandardTriggers"('"Sales"."SalesReturnLines"', true);
CREATE INDEX "salesReturnLineItemIdx" ON "Sales"."SalesReturnLines" ("tenantId", "itemId");
CREATE INDEX "salesReturnLineInvlIdx" ON "Sales"."SalesReturnLines" ("tenantId", "invoiceLineId") WHERE "invoiceLineId" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- PosShifts — app/sales/pos (src/93-sales-docs.js POS.shift: "Shift open
-- since 09:00 · Counter 1", Cashier, Rs 10,000 float; "Close shift" modal:
-- Opening float, Cash sales, Expected in drawer, Counted, Over / Short, Card,
-- Wallets, Bills; "Close shift & print Z-report Z-2026-0412").
-- ---------------------------------------------------------------------------
CREATE TABLE "Sales"."PosShifts" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "zReportNo"      text,                                                        -- Z-2026-0412 (doc type ZR, assigned on close)
  "branchId"        uuid NOT NULL,
  "warehouseId"     uuid NOT NULL,                                               -- stock point of the counter (→ Inventory.Warehouses)
  "counterName"     text NOT NULL,                                               -- "Counter 1"
  "cashierUserId"  uuid NOT NULL,                                               -- "Cashier Sana Javed"
  "cashAccountId"  uuid,                                                        -- drawer (→ BankCash.CashAccounts)
  "openedAt"        timestamptz NOT NULL DEFAULT now(),
  "closedAt"        timestamptz,
  "openingFloat"    numeric(18,2) NOT NULL DEFAULT 0 CHECK ("openingFloat" >= 0),
  "cashSales"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("cashSales" >= 0),    -- net of change given
  "cardSales"       numeric(18,2) NOT NULL DEFAULT 0 CHECK ("cardSales" >= 0),
  "walletSales"     numeric(18,2) NOT NULL DEFAULT 0 CHECK ("walletSales" >= 0),  -- JazzCash + Easypaisa
  "creditSales"     numeric(18,2) NOT NULL DEFAULT 0 CHECK ("creditSales" >= 0),
  "billsCount"      integer NOT NULL DEFAULT 0 CHECK ("billsCount" >= 0),
  "expectedCash"    numeric(18,2) GENERATED ALWAYS AS ("openingFloat" + "cashSales") STORED,   -- "Expected in drawer"
  "countedCash"     numeric(18,2) CHECK ("countedCash" >= 0),                     -- "Counted"
  "overShort"       numeric(18,2) GENERATED ALWAYS AS ("countedCash" - "openingFloat" - "cashSales") STORED, -- "Over / Short"
  status           text NOT NULL DEFAULT 'OPEN',
  "zPrintedAt"     timestamptz,
  "journalEntryId" uuid,                                                        -- over/short entry (→ Accounting.Vouchers)
  remarks          text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "branchId")       REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "cashierUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "posShiftCloseChk" CHECK (status = 'OPEN' OR ("closedAt" IS NOT NULL AND "countedCash" IS NOT NULL AND "zReportNo" IS NOT NULL)),
  CONSTRAINT "posShiftTimeChk"  CHECK ("closedAt" IS NULL OR "closedAt" >= "openedAt")
);
SELECT "Company"."addStandardTriggers"('"Sales"."PosShifts"', true);
CREATE UNIQUE INDEX "posShiftZUq"        ON "Sales"."PosShifts" ("tenantId", "zReportNo") WHERE "zReportNo" IS NOT NULL;
CREATE UNIQUE INDEX "posShiftOneOpenUq" ON "Sales"."PosShifts" ("tenantId", "branchId", "counterName") WHERE status = 'OPEN';
CREATE INDEX "posShiftCashierIdx" ON "Sales"."PosShifts" ("tenantId", "cashierUserId", "openedAt" DESC);
COMMENT ON TABLE "Sales"."PosShifts" IS 'POS till session per counter; closing it produces the Z-report. Tender totals are rolled up from Sales.PosPayments.';

-- PosShiftDenominations — "Close shift" denomination grid (Rs 5,000 …
-- Rs 10, Coins Rs 1 × Count = Amount). Helper table in the sales schema.
CREATE TABLE "Sales"."PosShiftDenominations" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "posShiftId"     uuid NOT NULL,
  denomination     numeric(18,2) NOT NULL CHECK (denomination IN (5000,1000,500,100,50,20,10,5,2,1)),
  "noteCount"       integer NOT NULL DEFAULT 0 CHECK ("noteCount" >= 0),
  amount           numeric(18,2) GENERATED ALWAYS AS (denomination * "noteCount") STORED,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "posShiftId", denomination),
  FOREIGN KEY ("tenantId", "posShiftId") REFERENCES "Sales"."PosShifts" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Sales"."PosShiftDenominations"');

-- PosPayments — POS tender pad (Cash / Card / JazzCash / Easypaisa; Exact /
-- Rs 500 / 1,000 / 5,000 quick keys; Received; Change due) and the Credit
-- (on account) tender. Non-credit tenders generate a Sales.CustomerReceipts so AR
-- stays a single ledger.
CREATE TABLE "Sales"."PosPayments" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "posShiftId"     uuid NOT NULL,
  "invoiceId"       uuid NOT NULL,                                               -- POS-2026-004812
  tender           text NOT NULL,
  amount           numeric(18,2) NOT NULL CHECK (amount > 0),                   -- applied to the bill
  "tenderedAmount"  numeric(18,2) CHECK ("tenderedAmount" >= 0),                  -- "Received"
  "changeAmount"    numeric(18,2) NOT NULL DEFAULT 0 CHECK ("changeAmount" >= 0), -- "Change due"
  reference        text,                                                        -- card ref / wallet TID
  "receiptId"       uuid,                                                        -- generated receipt (non-CREDIT)
  "paidAt"          timestamptz NOT NULL DEFAULT now(),
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "posShiftId") REFERENCES "Sales"."PosShifts" ("tenantId", id),
  FOREIGN KEY ("tenantId", "invoiceId")   REFERENCES "Sales"."SalesInvoices" ("tenantId", id),
  FOREIGN KEY ("tenantId", "receiptId")   REFERENCES "Sales"."CustomerReceipts" ("tenantId", id),
  CONSTRAINT "posPaymentChangeChk"  CHECK (tender = 'CASH' OR "changeAmount" = 0),
  CONSTRAINT "posPaymentCashChk"    CHECK (tender <> 'CASH' OR "tenderedAmount" IS NULL OR "changeAmount" = "tenderedAmount" - amount),
  CONSTRAINT "posPaymentReceiptChk" CHECK ((tender = 'CREDIT') = ("receiptId" IS NULL))
);
SELECT "Company"."addStandardTriggers"('"Sales"."PosPayments"', true);
CREATE INDEX "posPaymentShiftIdx"   ON "Sales"."PosPayments" ("tenantId", "posShiftId", tender);
CREATE INDEX "posPaymentInvoiceIdx" ON "Sales"."PosPayments" ("tenantId", "invoiceId");

-- ---------------------------------------------------------------------------
-- CreditOverrides — app/receivables/credit ("Override approvals": exceed
-- limit / release hold / temporary limit; "Approve credit override" modal:
-- limit, balance, this invoice, exposure after posting, overdue, Override
-- type One-time / Temporary limit increase, Valid until, Condition /
-- comments), invoice list "Credit override pending", Sales Voucher credit
-- warning, wholesale PIN override (Distribution.CreditOverrideLogs keeps attempts).
-- CO-2026-0041.
-- ---------------------------------------------------------------------------
CREATE TABLE "Sales"."CreditOverrides" (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"                text NOT NULL,                                          -- CO-2026-0041
  "customerId"           uuid NOT NULL,
  "overrideType"         text NOT NULL,
  "invoiceId"            uuid,                                                   -- "City Mart — INV-2026-000147"
  "salesOrderId"        uuid,                                                   -- "release SO-2026-000089"
  "documentAmount"       numeric(18,2) CHECK ("documentAmount" >= 0),             -- "This invoice Rs 486,750"
  "creditLimitSnapshot" numeric(18,2) NOT NULL CHECK ("creditLimitSnapshot" >= 0),
  "balanceSnapshot"      numeric(18,2) NOT NULL,                                 -- "Current balance"
  "exposureAfter"        numeric(18,2),                                          -- "Exposure after posting (124%)"
  "overdueSnapshot"      numeric(18,2) NOT NULL DEFAULT 0 CHECK ("overdueSnapshot" >= 0),
  "exceedByAmount"      numeric(18,2) CHECK ("exceedByAmount" >= 0),            -- "Exceeds limit by Rs 355,850"
  "tempLimitAmount"     numeric(18,2) CHECK ("tempLimitAmount" > 0),            -- "temporary limit Rs 1,500,000"
  "validUntil"           date,
  "requestReason"        text,                                                   -- "For October banquet season"
  "conditionComments"    text,                                                   -- "Approve subject to cheque … by 05 Oct"
  "approvalMethod"       text NOT NULL DEFAULT 'APPROVAL',
  "requestedByUserId"  uuid NOT NULL,
  "requestedAt"          timestamptz NOT NULL DEFAULT now(),
  "approverUserId"      uuid,                                                   -- assigned approver (Sana Javed / Ahmed Raza)
  "decidedByUserId"    uuid,
  "decidedAt"            timestamptz,
  status                text NOT NULL DEFAULT 'PENDING',
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "createdBy"            uuid,
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedBy"            uuid,
  "rowVersion"           integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  FOREIGN KEY ("tenantId", "customerId")          REFERENCES "Sales"."Customers" ("tenantId", id),
  FOREIGN KEY ("tenantId", "invoiceId", "customerId") REFERENCES "Sales"."SalesInvoices" ("tenantId", id, "customerId"),
  FOREIGN KEY ("tenantId", "salesOrderId")       REFERENCES "Sales"."SalesOrders" ("tenantId", id),
  FOREIGN KEY ("tenantId", "requestedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "approverUserId")     REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "decidedByUserId")   REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "creditOverrideTempChk"     CHECK ("overrideType" <> 'TEMP_LIMIT' OR ("tempLimitAmount" IS NOT NULL AND "validUntil" IS NOT NULL)),
  CONSTRAINT "creditOverrideDocChk"      CHECK ("overrideType" = 'TEMP_LIMIT' OR num_nonnulls("invoiceId", "salesOrderId") >= 1),
  CONSTRAINT "creditOverrideDecisionChk" CHECK (status IN ('PENDING','EXPIRED') OR ("decidedByUserId" IS NOT NULL AND "decidedAt" IS NOT NULL)),
  CONSTRAINT "creditOverrideSodChk"      CHECK ("decidedByUserId" IS NULL OR "decidedByUserId" <> "requestedByUserId")
);
SELECT "Company"."addStandardTriggers"('"Sales"."CreditOverrides"', true);
CREATE INDEX "creditOverrideCustomerIdx" ON "Sales"."CreditOverrides" ("tenantId", "customerId", "requestedAt" DESC);
CREATE INDEX "creditOverridePendingIdx"  ON "Sales"."CreditOverrides" ("tenantId", "approverUserId") WHERE status = 'PENDING';
CREATE INDEX "creditOverrideTempIdx"     ON "Sales"."CreditOverrides" ("tenantId", "customerId", "validUntil")
  WHERE "overrideType" = 'TEMP_LIMIT' AND status = 'APPROVED';
COMMENT ON TABLE "Sales"."CreditOverrides" IS 'Request + decision to exceed a credit limit (one document), raise it temporarily, or release a hold. Approved TEMP_LIMIT rows feed v_credit_exposure.effective_limit.';

-- CreditHoldEvents — holds and releases on a customer account ("Automatic
-- hold applied 15 Sep 2026", "Hold — bounced cheque", "Level 3 — 45 days
-- overdue: automatic credit hold", "Release"). Append-only history; the
-- current state is Sales.Customers.status / holdReason.
CREATE TABLE "Sales"."CreditHoldEvents" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "customerId"          uuid NOT NULL,
  "eventType"           text NOT NULL,
  reason               text NOT NULL,
  source               text NOT NULL DEFAULT 'AUTO',
  "occurredAt"          timestamptz NOT NULL DEFAULT now(),
  "userId"              uuid,                                                    -- NULL = system
  "creditOverrideId"   uuid,                                                    -- RELEASE via override
  "chequeId"            uuid,                                                    -- bounced cheque #118845 (→ BankCash.Cheques)
  "receiptId"           uuid,
  "reminderRuleId"     uuid,                                                    -- dunning level that placed the hold
  "exposureAmount"      numeric(18,2),
  "overdueAmount"       numeric(18,2),
  notes                text,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "customerId")        REFERENCES "Sales"."Customers" ("tenantId", id),
  FOREIGN KEY ("tenantId", "userId")            REFERENCES "Company"."Users" ("tenantId", id),
  FOREIGN KEY ("tenantId", "creditOverrideId") REFERENCES "Sales"."CreditOverrides" ("tenantId", id),
  FOREIGN KEY ("tenantId", "receiptId")         REFERENCES "Sales"."CustomerReceipts" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Sales"."CreditHoldEvents"', true);
CREATE TRIGGER "creditHoldEventAppendOnly" BEFORE UPDATE OR DELETE ON "Sales"."CreditHoldEvents"
  FOR EACH ROW EXECUTE FUNCTION "Company"."triggerAppendOnly"();
CREATE INDEX "creditHoldEventCustomerIdx" ON "Sales"."CreditHoldEvents" ("tenantId", "customerId", "occurredAt" DESC);
COMMENT ON TABLE "Sales"."CreditHoldEvents" IS 'Append-only log of credit holds / releases (manual, automatic over-limit or overdue, bounced cheque, dunning).';

-- ---------------------------------------------------------------------------
-- PaymentReminderTemplates — app/receivables/reminders (src/9A-company-plus.js TPL:
-- Gentle heads-up / Due today / Firm follow-up / Final notice + hold, each
-- in English and اردو with {customer} {invoice} {amount} {dueDate}).
-- ---------------------------------------------------------------------------
CREATE TABLE "Sales"."PaymentReminderTemplates" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code             text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,29}$'),       -- GENTLE, DUE, FIRM, FINAL
  name             text NOT NULL,                                               -- "Gentle heads-up"
  "emailSubject"    text,                                                        -- "Overdue: {invoice}"
  "bodyEn"          text NOT NULL,
  "bodyUr"          text,                                                        -- RTL Urdu body
  "isActive"        boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", code)
);
SELECT "Company"."addStandardTriggers"('"Sales"."PaymentReminderTemplates"');
COMMENT ON TABLE "Sales"."PaymentReminderTemplates" IS 'Bilingual (EN/UR) reminder message templates with {customer} {invoice} {amount} {dueDate} placeholders.';

-- PaymentReminderRules — "Reminder schedule" (3 days before due / On due date /
-- 7 / 15 / 30 days after due; channel toggles WhatsApp / SMS / Email;
-- template; enable switch; "Escalate to Zainab Raza and place account on
-- credit hold"; "Runs every morning at 9:00 AM") and the Credit Control
-- "Dunning schedule" ladder (Pre-due, Level 1, Level 2 call task + statement,
-- Level 3 credit hold, Final legal notice & provision review).
CREATE TABLE "Sales"."PaymentReminderRules" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  name                 text NOT NULL,                                           -- "7 days after due"
  "offsetDays"          integer NOT NULL CHECK ("offsetDays" BETWEEN -60 AND 365),-- −3, 0, 7, 15, 30
  "dunningLevel"        text NOT NULL,
  "sendWhatsapp"        boolean NOT NULL DEFAULT false,
  "sendSms"             boolean NOT NULL DEFAULT false,
  "sendEmail"           boolean NOT NULL DEFAULT true,
  "templateId"          uuid NOT NULL,
  action               text NOT NULL DEFAULT 'MESSAGE',
  "attachStatement"     boolean NOT NULL DEFAULT false,
  escalate             boolean NOT NULL DEFAULT false,
  "escalateToUserId"  uuid,
  "applyCreditHold"    boolean NOT NULL DEFAULT false,
  "runTime"             time NOT NULL DEFAULT '09:00',
  "isActive"            boolean NOT NULL DEFAULT true,
  "sentCount"           integer NOT NULL DEFAULT 0 CHECK ("sentCount" >= 0),      -- "412 sent this quarter" (rolling counter)
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "offsetDays"),
  FOREIGN KEY ("tenantId", "templateId")         REFERENCES "Sales"."PaymentReminderTemplates" ("tenantId", id),
  FOREIGN KEY ("tenantId", "escalateToUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "reminderRuleChannelChk"  CHECK ("sendWhatsapp" OR "sendSms" OR "sendEmail" OR action <> 'MESSAGE'),
  CONSTRAINT "reminderRuleEscalateChk" CHECK (NOT escalate OR "escalateToUserId" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Sales"."PaymentReminderRules"');
COMMENT ON TABLE "Sales"."PaymentReminderRules" IS 'Dunning ladder: when (days from due), how (channels, template) and what else (call task, credit hold, escalation).';

-- PaymentReminderLogs — "Sent log" (Time, Customer, Invoice, Channel, Rule,
-- Status Read / Delivered / Sent / Failed; delivery receipts from WhatsApp
-- Business API, Jazz SMS gateway, email), "Send now" / "Send to all",
-- Overdue customers "Last reminder".
CREATE TABLE "Sales"."PaymentReminderLogs" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "sentAt"             timestamptz NOT NULL DEFAULT now(),
  "customerId"         uuid NOT NULL,
  "invoiceId"          uuid,
  "reminderRuleId"    uuid,
  "templateId"         uuid,
  channel             text NOT NULL,
  language            text NOT NULL DEFAULT 'EN',
  recipient           text NOT NULL,                                            -- phone / e-mail
  "triggerMode"        text NOT NULL DEFAULT 'AUTO',
  amount              numeric(18,2),                                            -- amount chased
  "daysOverdue"        integer,
  status              text NOT NULL DEFAULT 'QUEUED',
  "providerMessageId" text,
  "errorMessage"       text,
  "sentByUserId"     uuid,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "customerId")      REFERENCES "Sales"."Customers" ("tenantId", id),
  FOREIGN KEY ("tenantId", "invoiceId", "customerId") REFERENCES "Sales"."SalesInvoices" ("tenantId", id, "customerId"),
  FOREIGN KEY ("tenantId", "reminderRuleId") REFERENCES "Sales"."PaymentReminderRules" ("tenantId", id),
  FOREIGN KEY ("tenantId", "templateId")      REFERENCES "Sales"."PaymentReminderTemplates" ("tenantId", id),
  FOREIGN KEY ("tenantId", "sentByUserId")  REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "reminderLogFailChk" CHECK (status <> 'FAILED' OR "errorMessage" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Sales"."PaymentReminderLogs"');
CREATE INDEX "reminderLogTimeIdx"     ON "Sales"."PaymentReminderLogs" ("tenantId", "sentAt" DESC);
CREATE INDEX "reminderLogCustomerIdx" ON "Sales"."PaymentReminderLogs" ("tenantId", "customerId", "sentAt" DESC);
CREATE INDEX "reminderLogInvoiceIdx"  ON "Sales"."PaymentReminderLogs" ("tenantId", "invoiceId", "sentAt" DESC) WHERE "invoiceId" IS NOT NULL;
CREATE UNIQUE INDEX "reminderLogProviderUq" ON "Sales"."PaymentReminderLogs" ("tenantId", channel, "providerMessageId") WHERE "providerMessageId" IS NOT NULL;
COMMENT ON TABLE "Sales"."PaymentReminderLogs" IS 'One row per message sent (per channel). Status is updated by provider delivery receipts.';

-- ---------------------------------------------------------------------------
-- RecurringInvoices — app/sales/recurring (src/9A-company-plus.js P:
-- RP-0012 customer, profile name, frequency Weekly / Monthly / Quarterly /
-- Every N days, next run, amount incl. GST, auto-send + channels email /
-- WhatsApp, status Active / Paused / Ends soon, runs, end Never / On a date /
-- After N runs; "New recurring profile" drawer: start date, template lines,
-- "Save as draft first"; actions Run now, Pause/Resume, Skip next run).
-- ---------------------------------------------------------------------------
CREATE TABLE "Sales"."RecurringInvoices" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"              text NOT NULL,                                            -- RP-0012
  "customerId"         uuid NOT NULL,
  name                text NOT NULL,                                            -- "Office supplies standing order"
  "branchId"           uuid,
  "warehouseId"        uuid,                                                     -- → Inventory.Warehouses
  "paymentTerms"       text NOT NULL DEFAULT 'NET_30',
  frequency           text NOT NULL,
  "everyDays"          integer CHECK ("everyDays" BETWEEN 1 AND 366),              -- "Every 45 days"
  "startDate"          date NOT NULL,
  "nextRunDate"       date,
  "runTime"            time NOT NULL DEFAULT '06:00',                            -- "raised at 6:00 AM"
  "endMode"            text NOT NULL DEFAULT 'NEVER',
  "endDate"            date,
  "maxRuns"            integer CHECK ("maxRuns" > 0),
  "runsCount"          integer NOT NULL DEFAULT 0 CHECK ("runsCount" >= 0),
  amount              numeric(18,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),     -- "Amount (Rs) incl. GST"
  "autoSend"           boolean NOT NULL DEFAULT true,
  "sendEmail"          boolean NOT NULL DEFAULT true,
  "sendWhatsapp"       boolean NOT NULL DEFAULT false,
  "saveAsDraft"       boolean NOT NULL DEFAULT false,                           -- "Review before anything is sent"
  status              text NOT NULL DEFAULT 'ACTIVE',
  "lastRunAt"         timestamptz,
  "lastInvoiceId"     uuid,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "docNo"),
  FOREIGN KEY ("tenantId", "customerId")     REFERENCES "Sales"."Customers" ("tenantId", id),
  FOREIGN KEY ("tenantId", "branchId")       REFERENCES "Company"."Branches" ("tenantId", id),
  FOREIGN KEY ("tenantId", "lastInvoiceId") REFERENCES "Sales"."SalesInvoices" ("tenantId", id),
  CONSTRAINT "recurringProfileCustomChk"  CHECK ((frequency = 'CUSTOM') = ("everyDays" IS NOT NULL)),
  CONSTRAINT "recurringProfileEndChk"     CHECK (("endMode" = 'ON_DATE') = ("endDate" IS NOT NULL)
                                              AND ("endMode" = 'AFTER_RUNS') = ("maxRuns" IS NOT NULL)),
  CONSTRAINT "recurringProfileEnddateChk" CHECK ("endDate" IS NULL OR "endDate" >= "startDate"),
  CONSTRAINT "recurringProfileRunsChk"    CHECK ("maxRuns" IS NULL OR "runsCount" <= "maxRuns"),
  CONSTRAINT "recurringProfileSendChk"    CHECK (NOT "autoSend" OR (("sendEmail" OR "sendWhatsapp") AND NOT "saveAsDraft")),
  CONSTRAINT "recurringProfileNextChk"    CHECK (status <> 'ACTIVE' OR "nextRunDate" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Sales"."RecurringInvoices"', true);
CREATE INDEX "recurringProfileDueIdx"      ON "Sales"."RecurringInvoices" ("tenantId", "nextRunDate") WHERE status = 'ACTIVE';
CREATE INDEX "recurringProfileCustomerIdx" ON "Sales"."RecurringInvoices" ("tenantId", "customerId");
COMMENT ON TABLE "Sales"."RecurringInvoices" IS 'Schedule that raises the same invoice (channel STANDARD, invoice.recurringProfileId). MRR and "Ends soon" are derived.';

CREATE TABLE "Sales"."RecurringInvoiceLines" (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "recurringProfileId" uuid NOT NULL,
  "lineNo"              smallint NOT NULL CHECK ("lineNo" > 0),
  "itemId"              uuid,                                                    -- → Inventory.Products
  description          text NOT NULL,
  "qtyCtn"              numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyCtn" >= 0),
  "qtyLoose"            numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyLoose" >= 0),
  "ctnFactor"           numeric(18,3) NOT NULL DEFAULT 1 CHECK ("ctnFactor" > 0),
  "baseQty"             numeric(18,3) NOT NULL CHECK ("baseQty" > 0),             -- "Qty"
  rate                 numeric(18,4) NOT NULL CHECK (rate >= 0),                -- "Rate"
  "useCurrentPrice"    boolean NOT NULL DEFAULT true,                           -- re-price from the price list at each run
  "taxCodeId"          uuid,
  "taxRate"             numeric(7,4) NOT NULL DEFAULT 0 CHECK ("taxRate" BETWEEN 0 AND 100),
  "taxableAmount"       numeric(18,2) NOT NULL CHECK ("taxableAmount" >= 0),      -- "Amount"
  "taxAmount"           numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
  "totalAmount"         numeric(18,2) NOT NULL CHECK ("totalAmount" >= 0),
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "createdBy"           uuid,
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedBy"           uuid,
  "rowVersion"          integer NOT NULL DEFAULT 0,
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", "recurringProfileId", "lineNo"),
  FOREIGN KEY ("tenantId", "recurringProfileId") REFERENCES "Sales"."RecurringInvoices" ("tenantId", id),
  CONSTRAINT "recurringInvoiceLineQtyChk"   CHECK ("baseQty" = "qtyCtn" * "ctnFactor" + "qtyLoose"),
  CONSTRAINT "recurringInvoiceLineTotalChk" CHECK ("totalAmount" = "taxableAmount" + "taxAmount")
);
SELECT "Company"."addStandardTriggers"('"Sales"."RecurringInvoiceLines"');
CREATE INDEX "recurringInvoiceLineItemIdx" ON "Sales"."RecurringInvoiceLines" ("tenantId", "itemId");

-- ---------------------------------------------------------------------------
-- Intra-sales FKs for the [Full] columns added to Basic tables
-- ---------------------------------------------------------------------------
ALTER TABLE "Sales"."SalesInvoices"
  ADD CONSTRAINT "invoiceCreditOverrideIdFk"   FOREIGN KEY ("tenantId", "creditOverrideId")   REFERENCES "Sales"."CreditOverrides" ("tenantId", id),
  ADD CONSTRAINT "invoicePosShiftIdFk"         FOREIGN KEY ("tenantId", "posShiftId")         REFERENCES "Sales"."PosShifts" ("tenantId", id),
  ADD CONSTRAINT "invoiceRecurringProfileIdFk" FOREIGN KEY ("tenantId", "recurringProfileId") REFERENCES "Sales"."RecurringInvoices" ("tenantId", id),
  ADD CONSTRAINT "invoiceDeliveryChallanIdFk"  FOREIGN KEY ("tenantId", "deliveryChallanId")  REFERENCES "Sales"."DeliveryChallans" ("tenantId", id),
  ADD CONSTRAINT "invoiceShipToAddressIdFk"   FOREIGN KEY ("tenantId", "shipToAddressId")   REFERENCES "Sales"."CustomerAddresses" ("tenantId", id),
  ADD CONSTRAINT "invoiceSchemeIdFk"            FOREIGN KEY ("tenantId", "schemeId")            REFERENCES "Sales"."SalesSchemes" ("tenantId", id),
  ADD CONSTRAINT "invoicePosShiftChk"           CHECK (channel <> 'POS' OR "posShiftId" IS NOT NULL);

ALTER TABLE "Sales"."SalesInvoiceLines"
  ADD CONSTRAINT "invoiceLineSchemeIdFk"                FOREIGN KEY ("tenantId", "schemeId")                REFERENCES "Sales"."SalesSchemes" ("tenantId", id),
  ADD CONSTRAINT "invoiceLineDeliveryChallanLineIdFk" FOREIGN KEY ("tenantId", "deliveryChallanLineId") REFERENCES "Sales"."DeliveryChallanLines" ("tenantId", id);

ALTER TABLE "Sales"."CreditNotes"
  ADD CONSTRAINT "creditNoteSalesReturnIdFk" FOREIGN KEY ("tenantId", "salesReturnId") REFERENCES "Sales"."SalesReturns" ("tenantId", id);

ALTER TABLE "Sales"."CustomerReceipts"
  ADD CONSTRAINT "receiptPosShiftIdFk" FOREIGN KEY ("tenantId", "posShiftId") REFERENCES "Sales"."PosShifts" ("tenantId", id);

ALTER TABLE "Sales"."CreditHoldEvents"
  ADD CONSTRAINT "creditHoldEventReminderRuleIdFk" FOREIGN KEY ("tenantId", "reminderRuleId") REFERENCES "Sales"."PaymentReminderRules" ("tenantId", id);

CREATE INDEX "invoicePosShiftIdx" ON "Sales"."SalesInvoices" ("tenantId", "posShiftId") WHERE "posShiftId" IS NOT NULL;
CREATE INDEX "invoiceRouteIdx"     ON "Sales"."SalesInvoices" ("tenantId", "routeId", "docDate" DESC) WHERE "routeId" IS NOT NULL;
CREATE INDEX "invoiceSalesmanIdx"  ON "Sales"."SalesInvoices" ("tenantId", "salesmanEmployeeId", "docDate" DESC) WHERE "salesmanEmployeeId" IS NOT NULL;
CREATE INDEX "invoiceRecurringIdx" ON "Sales"."SalesInvoices" ("tenantId", "recurringProfileId") WHERE "recurringProfileId" IS NOT NULL;
CREATE INDEX "invoiceChallanIdx"   ON "Sales"."SalesInvoices" ("tenantId", "deliveryChallanId") WHERE "deliveryChallanId" IS NOT NULL;
CREATE INDEX "invoiceOverrideIdx"  ON "Sales"."SalesInvoices" ("tenantId", "creditOverrideId") WHERE "creditOverrideId" IS NOT NULL;
CREATE INDEX "customerChannelIdx"  ON "Sales"."Customers" ("tenantId", "customerChannel", "priceTier");
CREATE INDEX "creditNoteSrIdx"    ON "Sales"."CreditNotes" ("tenantId", "salesReturnId") WHERE "salesReturnId" IS NOT NULL;
CREATE INDEX "receiptPosShiftIdx" ON "Sales"."CustomerReceipts" ("tenantId", "posShiftId") WHERE "posShiftId" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Full-only guards (same generic functions as Basic)
-- ---------------------------------------------------------------------------
CREATE TRIGGER "salesReturnFreeze" BEFORE UPDATE ON "Sales"."SalesReturns"
  FOR EACH ROW EXECUTE FUNCTION "Sales"."triggerFreezeWhenPosted"(
    'DRAFT', 'docNo', 'docDate', 'returnType', 'customerId', 'invoiceId', 'warehouseId',
    'valueAmount', 'taxAmount', 'totalAmount', 'costAmount');

CREATE TRIGGER "salesReturnLineEditable" BEFORE INSERT OR UPDATE OR DELETE ON "Sales"."SalesReturnLines"
  FOR EACH ROW EXECUTE FUNCTION "Sales"."triggerLinesEditable"('"Sales"."SalesReturns"', 'salesReturnId', 'DRAFT');

CREATE TRIGGER "deliveryChallanFreeze" BEFORE UPDATE ON "Sales"."DeliveryChallans"
  FOR EACH ROW EXECUTE FUNCTION "Sales"."triggerFreezeWhenPosted"(
    'PACKED', 'docNo', 'docDate', 'salesOrderId', 'customerId', 'warehouseId', 'totalQty', 'costAmount');

CREATE TRIGGER "deliveryChallanLineEditable" BEFORE INSERT OR UPDATE OR DELETE ON "Sales"."DeliveryChallanLines"
  FOR EACH ROW EXECUTE FUNCTION "Sales"."triggerLinesEditable"('"Sales"."DeliveryChallans"', 'deliveryChallanId', 'PACKED');

CREATE TRIGGER "posShiftFreeze" BEFORE UPDATE ON "Sales"."PosShifts"
  FOR EACH ROW EXECUTE FUNCTION "Sales"."triggerFreezeWhenPosted"(
    'OPEN', 'zReportNo', 'branchId', 'counterName', 'cashierUserId', 'openedAt', 'closedAt',
    'openingFloat', 'cashSales', 'cardSales', 'walletSales', 'creditSales', 'countedCash');

ALTER TABLE "Sales"."SalesInvoices"
  ADD CONSTRAINT "invoiceSchemeAmountChk" CHECK ("schemeAmount" <= "discountAmount"),
  ADD CONSTRAINT "invoiceStockIssuedChk"  CHECK ("stockIssuedAt" IS NULL OR status <> 'DRAFT');
CREATE INDEX "invoiceStockPendingIdx" ON "Sales"."SalesInvoices" ("tenantId", "routeId")
  WHERE "stockIssueMode" = 'AT_DISPATCH' AND "stockIssuedAt" IS NULL AND status <> 'VOID';
