-- =============================================================================
-- Finsoft ERP (BASIC) — 07-sales.sql
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
