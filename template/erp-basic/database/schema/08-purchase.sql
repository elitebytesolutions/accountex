-- =============================================================================
-- Finsoft ERP (BASIC) — 08-purchase.sql
-- Purchases & payables: vendors, purchase orders → goods received (GRN) →
-- vendor bills / purchase vouchers, debit notes, vendor payments and their
-- allocation to bills.
--
-- Screens (src/41-acc-trade.html, src/44-purchase-docs.html + 94-purchase-docs.js,
--          src/45-studios.html + 96-studio.js, seed data src/91-data.js):
--   app/vendors, app/vendors/view
--   app/purchases/orders, app/purchases/grn, app/purchases/bills,
--   app/purchases/bills/new, app/purchases/voucher, app/purchases/debit-notes
--   app/payables/payments, app/payables/ageing (views only)
--
-- Design notes
--  * One bill table for every supplier invoice: channel STANDARD (Vendor Bill,
--    BILL-2026-000087) or COUNTER (Purchase Voucher, PV-2026-000318).
--  * Documents are inserted as DRAFT and posted by a status UPDATE (lines must
--    exist before the post). Posted documents are locked by trigger: only the
--    settlement columns (balance, allocated, status …) may change afterwards.
--  * VendorPaymentAllocations is the single AP settlement ledger: a vendor payment OR
--    a debit note settles a bill. Bill / payment / debit-note balances are
--    maintained from it by trigger.
--  * Quantities are in base (piece) units; baseQty = qtyCtn * Inventory.Products.ctn +
--    qtyLoose is enforced by Purchases.triggerBaseQty() when cartons/loose are given.
--  * Cross-module FKs (inv, acc, tax, treasury) live in fk/08-purchase-fks.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- VendorCategories — lookup behind the "Category" select on app/vendors
-- (New Vendor modal: IT & Electrical / Packaging / Utilities / Logistics /
-- Services; list filter adds Textiles; seed shows Vehicle parts, Pantry,
-- Telecom, Office supplies, Pallets — "11 categories"). src/41-acc-trade.html
-- ---------------------------------------------------------------------------
CREATE TABLE "Purchases"."VendorCategories" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  name             text NOT NULL CHECK (length(trim(name)) > 0),   -- IT & Electrical
  "sortOrder"       integer NOT NULL DEFAULT 0,
  "isActive"        boolean NOT NULL DEFAULT true,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  CONSTRAINT "vendorCategoryTenantIdUk" UNIQUE ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Purchases"."VendorCategories"');
CREATE UNIQUE INDEX "vendorCategoryNameUk" ON "Purchases"."VendorCategories" ("tenantId", lower(name))
  WHERE "deletedAt" IS NULL;
COMMENT ON TABLE "Purchases"."VendorCategories" IS 'Vendor categories (app/vendors category select and filter).';

-- ---------------------------------------------------------------------------
-- vendor — app/vendors (list + New Vendor modal), app/vendors/view (Vendor
-- Detail: Overview / Bills / Payments / Statement / Documents), PV quick-add
-- supplier drawer (app/purchases/voucher). src/41-acc-trade.html,
-- src/94-purchase-docs.js, seed FS_DATA.vendors (src/91-data.js)
-- ---------------------------------------------------------------------------
CREATE TABLE "Purchases"."Vendors" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  code                text NOT NULL CHECK (code ~ '^VEN-[0-9]{4,}$'),       -- VEN-0003
  name                text NOT NULL CHECK (length(trim(name)) > 0),         -- Siemens Pakistan
  "legalName"          text,                                                 -- Siemens Pakistan Engineering Co. Ltd
  "categoryId"         uuid,
  -- identity & tax ("Identity & tax — ATL status is verified against FBR on save")
  ntn                 text CHECK (ntn IS NULL OR ntn ~ '^[0-9]{7}-[0-9]$'),            -- 0711548-2
  cnic                text CHECK (cnic IS NULL OR cnic ~ '^[0-9]{5}-[0-9]{7}-[0-9]$'), -- unregistered suppliers (Ghani Pallet Works)
  strn                text,                                                 -- 12-03-9999-111-22 ("STRN registered" badge)
  "atlStatus"          text NOT NULL DEFAULT 'UNVERIFIED',   -- "Active Taxpayer" / "Not on ATL"
  "atlVerifiedAt"     timestamptz,                                          -- "Verify ATL" button / NTN Certificate "Verified 02 Jul 2026"
  "defaultWhtSection" text NOT NULL DEFAULT '153_1_A',
                                                                            -- 153(1)(a) goods 5% / (b) services 8% / (c) contracts 7.5% / Exempt
  -- accounting & terms
  "defaultAccountId"  uuid,                                                 -- "Expense / inventory a/c" (1310 Inventory, 5310 IT Support …)
  "payableAccountId"  uuid,                                                 -- "Payable a/c 2110 Trade Creditors"; NULL = company AP control
  "paymentTerms"       text NOT NULL DEFAULT 'NET_30',
  "creditDays"         smallint NOT NULL DEFAULT 30 CHECK ("creditDays" BETWEEN 0 AND 365),
  "currencyCode"       char(3) NOT NULL DEFAULT 'PKR' REFERENCES "Company"."Currencies"(code),
  -- contact & payment
  phone               text,                                                 -- 042-… / 021-32570011
  email               citext,                                               -- accounts@vendor.pk
  address             text,                                                 -- B-72 Estate Avenue, SITE, Karachi
  city                text,                                                 -- Karachi
  "bankName"           text,                                                 -- HBL (primary bank; Full adds Purchases.VendorBankAccounts)
  iban                text CHECK (iban IS NULL OR replace(iban, ' ', '') ~ '^PK[0-9]{2}[A-Z]{4}[0-9A-Z]{16}$'),
  "vendorSince"        date,                                                 -- "Vendor since 2019"
  status              text NOT NULL DEFAULT 'ACTIVE',   -- "Active Vendors 64" of 66
  remarks             text,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  "deletedAt"          timestamptz,
  CONSTRAINT "vendorTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "vendorCodeUk" UNIQUE ("tenantId", code),
  CONSTRAINT "vendorCategoryFk" FOREIGN KEY ("tenantId", "categoryId") REFERENCES "Purchases"."VendorCategories" ("tenantId", id),
  CONSTRAINT "vendorTermsDaysChk" CHECK ("paymentTerms" NOT IN ('ADVANCE','ON_RECEIPT') OR "creditDays" = 0)
);
SELECT "Company"."addStandardTriggers"('"Purchases"."Vendors"', true);
CREATE INDEX "vendorNameTrgmIdx" ON "Purchases"."Vendors" USING gin (name gin_trgm_ops);
CREATE INDEX "vendorTenantNameIdx" ON "Purchases"."Vendors" ("tenantId", name) WHERE "deletedAt" IS NULL;
CREATE INDEX "vendorTenantCategoryIdx" ON "Purchases"."Vendors" ("tenantId", "categoryId") WHERE "deletedAt" IS NULL;
CREATE INDEX "vendorTenantAtlIdx" ON "Purchases"."Vendors" ("tenantId", "atlStatus") WHERE "deletedAt" IS NULL;
CREATE INDEX "vendorTenantNtnIdx" ON "Purchases"."Vendors" ("tenantId", ntn) WHERE ntn IS NOT NULL;
COMMENT ON TABLE "Purchases"."Vendors" IS 'Supplier master (VEN-0001): FBR filer (ATL) status, default WHT section, payable account, terms, bank. Balance/overdue are derived (v_vendor_balance).';
COMMENT ON COLUMN "Purchases"."Vendors"."defaultWhtSection" IS 'Income Tax Ordinance s.153 section applied on bills/payments; the rate (5% / 8% / 7.5%, doubled for non-ATL) comes from the tax master at posting.';

-- VendorContacts — "Primary contact" card on app/vendors/view (Name, Role,
-- Phone, Email) and "Contact person" on the New Vendor modal.
CREATE TABLE "Purchases"."VendorContacts" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "vendorId"        uuid NOT NULL,
  "fullName"        text NOT NULL,                                 -- Adnan Siddiqui
  designation      text,                                          -- Key Account Manager
  phone            text,                                          -- 021-32570011
  mobile           text,                                          -- 0300-2245618
  email            citext,
  "isPrimary"       boolean NOT NULL DEFAULT false,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "createdBy"       uuid,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedBy"       uuid,
  "rowVersion"      integer NOT NULL DEFAULT 0,
  "deletedAt"       timestamptz,
  CONSTRAINT "vendorContactTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "vendorContactVendorFk" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "Purchases"."Vendors" ("tenantId", id)
);
SELECT "Company"."addStandardTriggers"('"Purchases"."VendorContacts"');
CREATE INDEX "vendorContactVendorIdx" ON "Purchases"."VendorContacts" ("tenantId", "vendorId");
CREATE UNIQUE INDEX "vendorContactOnePrimary" ON "Purchases"."VendorContacts" ("tenantId", "vendorId")
  WHERE "isPrimary" AND "deletedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- PurchaseOrders — app/purchases/orders (list: PO #, Vendor, Order Date,
-- Expected, Deliver to, Received, Amount, Approval; New Purchase Order modal:
-- Vendor, Order date, Expected delivery, Deliver to, Payment terms,
-- Department, lines; "routed for approval above Rs 500,000"; Approve /
-- Nudge / Receive / Bill / Debit note actions). src/41-acc-trade.html
-- ---------------------------------------------------------------------------
CREATE TABLE "Purchases"."PurchaseOrders" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"              text NOT NULL,                              -- PO-2026-000066
  "docDate"            date NOT NULL,                              -- Order date
  "vendorId"           uuid NOT NULL,
  "branchId"           uuid NOT NULL,                              -- Deliver to (Lahore HQ / Karachi / Islamabad / Faisalabad)
  "warehouseId"        uuid,                                       -- default receiving warehouse for the GRN
  "expectedDate"       date,                                       -- Expected delivery
  "paymentTerms"       text NOT NULL DEFAULT 'NET_30',
  "creditDays"         smallint NOT NULL DEFAULT 30 CHECK ("creditDays" BETWEEN 0 AND 365),
  "costCentreId"      uuid,                                       -- Department (Procurement / IT / Warehouse / Administration)
  "buyerUserId"       uuid,                                       -- avatar column (Usman Ali / Kashif Ali)
  "currencyCode"       char(3) NOT NULL DEFAULT 'PKR' REFERENCES "Company"."Currencies"(code),
  "fxRate"             numeric(18,6) NOT NULL DEFAULT 1 CHECK ("fxRate" > 0),
  "grossAmount"        numeric(18,2) NOT NULL DEFAULT 0 CHECK ("grossAmount" >= 0),
  "discountAmount"     numeric(18,2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),
  "netAmount"          numeric(18,2) NOT NULL DEFAULT 0,           -- Subtotal (excl. tax)
  "taxAmount"          numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),   -- GST 18%
  "totalAmount"        numeric(18,2) NOT NULL DEFAULT 0,           -- PO total / list "Amount (Rs)"
  status              text NOT NULL DEFAULT 'DRAFT',
  "submittedAt"        timestamptz,                                -- "Submit for approval"
  "approvedByUserId" uuid,
  "approvedAt"         timestamptz,
  "sentToVendorAt"   timestamptz,                                -- "approved and emailed to vendor"; NULL = "Not sent"
  "cancelledAt"        timestamptz,
  "cancelReason"       text,
  remarks             text,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  CONSTRAINT "purchaseOrderTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "purchaseOrderDocNoUk" UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "purchaseOrderVendorFk" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "Purchases"."Vendors" ("tenantId", id),
  CONSTRAINT "purchaseOrderBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "purchaseOrderBuyerFk" FOREIGN KEY ("tenantId", "buyerUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "purchaseOrderApproverFk" FOREIGN KEY ("tenantId", "approvedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "purchaseOrderAmountsChk" CHECK ("netAmount" = "grossAmount" - "discountAmount"
                                               AND "totalAmount" = "netAmount" + "taxAmount"),
  CONSTRAINT "purchaseOrderDatesChk" CHECK ("expectedDate" IS NULL OR "expectedDate" >= "docDate"),
  CONSTRAINT "purchaseOrderApprovedChk" CHECK (status IN ('DRAFT','PENDING_L1','PENDING_L2','CANCELLED') OR "approvedAt" IS NOT NULL),
  CONSTRAINT "purchaseOrderCancelChk" CHECK (status <> 'CANCELLED' OR "cancelledAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Purchases"."PurchaseOrders"', true);
CREATE INDEX "purchaseOrderStatusDateIdx" ON "Purchases"."PurchaseOrders" ("tenantId", status, "docDate" DESC);
CREATE INDEX "purchaseOrderVendorDateIdx" ON "Purchases"."PurchaseOrders" ("tenantId", "vendorId", "docDate" DESC);
CREATE INDEX "purchaseOrderBranchIdx" ON "Purchases"."PurchaseOrders" ("tenantId", "branchId", "docDate" DESC);
CREATE INDEX "purchaseOrderExpectedIdx" ON "Purchases"."PurchaseOrders" ("tenantId", "expectedDate")
  WHERE status IN ('APPROVED','PARTIALLY_RECEIVED');                -- "Awaiting Receipt · 1 expected today"
COMMENT ON TABLE "Purchases"."PurchaseOrders" IS 'Purchase order (PO-2026-000001) with two-level approval (PENDING_L1/L2), receipt and billing progress rolled up from lines.';
COMMENT ON COLUMN "Purchases"."PurchaseOrders".status IS 'DRAFT → PENDING_L1 → PENDING_L2 → APPROVED → PARTIALLY_RECEIVED → RECEIVED → BILLED; CANCELLED. Receipt/billing states are set by Purchases.refreshPurchaseOrderStatus().';

-- PurchaseOrderLines — New PO modal lines (Item, Qty, Rate, Tax, Amount);
-- received/billed counters drive "10 of 15 laptops", GRN "Ordered / Prev. recv."
CREATE TABLE "Purchases"."PurchaseOrderLines" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "purchaseOrderId"   uuid NOT NULL,
  "lineNo"             smallint NOT NULL CHECK ("lineNo" > 0),
  "itemId"             uuid,                                       -- IT-UPS-1K · APC Back-UPS 1100VA
  description         text,
  "accountId"          uuid,                                       -- non-stock lines (services)
  "qtyCtn"             numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyCtn" >= 0),
  "qtyLoose"           numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyLoose" >= 0),
  "baseQty"            numeric(18,3) NOT NULL CHECK ("baseQty" > 0),               -- Qty
  "bonusQty"           numeric(18,3) NOT NULL DEFAULT 0 CHECK ("bonusQty" >= 0),
  rate                numeric(18,4) NOT NULL CHECK (rate >= 0),                  -- Rate 31,200.00
  "discountPct"        numeric(7,4) NOT NULL DEFAULT 0 CHECK ("discountPct" BETWEEN 0 AND 100),
  "grossAmount"        numeric(18,2) NOT NULL,
  "discountAmount"     numeric(18,2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),
  "netAmount"          numeric(18,2) NOT NULL,                     -- Amount 624,000.00
  "taxCodeId"         uuid,                                       -- GST 18%
  "taxRate"            numeric(7,4) NOT NULL DEFAULT 0 CHECK ("taxRate" BETWEEN 0 AND 100),
  "taxAmount"          numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
  "totalAmount"        numeric(18,2) NOT NULL,
  "receivedQty"        numeric(18,3) NOT NULL DEFAULT 0,           -- maintained by GRN posting
  "billedQty"          numeric(18,3) NOT NULL DEFAULT 0,           -- maintained by bill posting
  "costCentreId"      uuid,
  remarks             text,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  CONSTRAINT "purchaseOrderLineTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "purchaseOrderLineNoUk" UNIQUE ("tenantId", "purchaseOrderId", "lineNo"),
  CONSTRAINT "purchaseOrderLineHeaderFk" FOREIGN KEY ("tenantId", "purchaseOrderId") REFERENCES "Purchases"."PurchaseOrders" ("tenantId", id),
  CONSTRAINT "purchaseOrderLineWhatChk" CHECK ("itemId" IS NOT NULL OR description IS NOT NULL),
  CONSTRAINT "purchaseOrderLineAmountsChk" CHECK ("grossAmount" = round("baseQty" * rate, 2)
                                                    AND "netAmount" = "grossAmount" - "discountAmount"
                                                    AND "totalAmount" = "netAmount" + "taxAmount"),
  CONSTRAINT "purchaseOrderLineReceivedChk" CHECK ("receivedQty" >= 0 AND "receivedQty" <= "baseQty" + "bonusQty"),
  CONSTRAINT "purchaseOrderLineBilledChk" CHECK ("billedQty" >= 0)
);
SELECT "Company"."addStandardTriggers"('"Purchases"."PurchaseOrderLines"', true);
CREATE INDEX "purchaseOrderLineItemIdx" ON "Purchases"."PurchaseOrderLines" ("tenantId", "itemId");

-- ---------------------------------------------------------------------------
-- grn — app/purchases/grn ("Receive against PO": PO select, meta Vendor / PO
-- date / Expected / Vendor bill, QC note, 3-way match panel, Receive into,
-- Post GRN; GRN Register: GRN #, Date, Purchase Order, Vendor, Warehouse,
-- Units, Value, QC, Bill). src/44-purchase-docs.html, src/94-purchase-docs.js
-- ---------------------------------------------------------------------------
CREATE TABLE "Purchases"."GoodsReceivedNotes" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"              text NOT NULL,                              -- GRN-2026-0086
  "docDate"            date NOT NULL,
  "purchaseOrderId"   uuid,                                       -- "Receive against PO"
  "vendorId"           uuid NOT NULL,
  "branchId"           uuid NOT NULL,
  "warehouseId"        uuid NOT NULL,                              -- "Receive into"
  "vendorRef"          text,                                       -- vendor delivery note / bill shown in meta (HP-INV-46011)
  "qcStatus"           text NOT NULL DEFAULT 'PASSED',
  "qcNote"             text,                                       -- "2 cartons crushed in transit — photographed …"
  "matchStatus"        text NOT NULL DEFAULT 'TWO_WAY_BILL_AWAITED',
  "billStatus"         text NOT NULL DEFAULT 'AWAITING',
  "receivedQty"        numeric(18,3) NOT NULL DEFAULT 0 CHECK ("receivedQty" >= 0),      -- "Units received now" / register Units
  "acceptedAmount"     numeric(18,2) NOT NULL DEFAULT 0 CHECK ("acceptedAmount" >= 0),   -- "Accepted value" / register Value
  "rejectedAmount"     numeric(18,2) NOT NULL DEFAULT 0 CHECK ("rejectedAmount" >= 0),   -- "Rejected (debit note)"
  status              text NOT NULL DEFAULT 'DRAFT',
  "postedAt"           timestamptz,
  "journalEntryId"    uuid,
  "cancelledAt"        timestamptz,
  "cancelReason"       text,
  remarks             text,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  CONSTRAINT "grnTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "grnDocNoUk" UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "grnPoFk" FOREIGN KEY ("tenantId", "purchaseOrderId") REFERENCES "Purchases"."PurchaseOrders" ("tenantId", id),
  CONSTRAINT "grnVendorFk" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "Purchases"."Vendors" ("tenantId", id),
  CONSTRAINT "grnBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "grnPostedChk" CHECK (status = 'DRAFT' OR "postedAt" IS NOT NULL OR status = 'CANCELLED'),
  CONSTRAINT "grnCancelChk" CHECK (status <> 'CANCELLED' OR "cancelledAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Purchases"."GoodsReceivedNotes"', true);
CREATE INDEX "grnDateIdx" ON "Purchases"."GoodsReceivedNotes" ("tenantId", "docDate" DESC);
CREATE INDEX "grnPoIdx" ON "Purchases"."GoodsReceivedNotes" ("tenantId", "purchaseOrderId");
CREATE INDEX "grnVendorIdx" ON "Purchases"."GoodsReceivedNotes" ("tenantId", "vendorId", "docDate" DESC);
CREATE INDEX "grnUnbilledIdx" ON "Purchases"."GoodsReceivedNotes" ("tenantId", "billStatus")
  WHERE status = 'POSTED' AND "billStatus" <> 'BILLED';             -- KPI "Received, not billed"
COMMENT ON TABLE "Purchases"."GoodsReceivedNotes" IS 'Goods received note (GRN-2026-000001) against a PO with QC result and 3-way match state. Posting = stock IN + Dr Inventory / Cr GRNI.';

-- GoodsReceivedNoteLines — GRN lines: Item, Ordered, Prev. recv., Received now, Accepted,
-- Rejected, Reason, Progress (+ batch / expiry / cost for the stock ledger)
CREATE TABLE "Purchases"."GoodsReceivedNoteLines" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "grnId"                 uuid NOT NULL,
  "lineNo"                smallint NOT NULL CHECK ("lineNo" > 0),
  "purchaseOrderLineId" uuid,
  "itemId"                uuid NOT NULL,
  "orderedQty"            numeric(18,3) NOT NULL DEFAULT 0 CHECK ("orderedQty" >= 0),       -- snapshot "Ordered"
  "prevReceivedQty"      numeric(18,3) NOT NULL DEFAULT 0 CHECK ("prevReceivedQty" >= 0), -- snapshot "Prev. recv."
  "receivedQty"           numeric(18,3) NOT NULL CHECK ("receivedQty" >= 0),                -- "Received now"
  "acceptedQty"           numeric(18,3) NOT NULL CHECK ("acceptedQty" >= 0),                -- "Accepted"
  "rejectedQty"           numeric(18,3) NOT NULL DEFAULT 0 CHECK ("rejectedQty" >= 0),      -- "Rejected"
  "rejectReason"          text,
  "batchId"               uuid,                                    -- Inventory.ProductBatches created/located on posting
  "batchNo"               text,
  "expiryDate"            date,
  "unitCost"              numeric(18,4) NOT NULL DEFAULT 0 CHECK ("unitCost" >= 0),          -- PO rate per base unit
  "acceptedAmount"        numeric(18,2) NOT NULL DEFAULT 0,
  "rejectedAmount"        numeric(18,2) NOT NULL DEFAULT 0,
  "billedQty"             numeric(18,3) NOT NULL DEFAULT 0 CHECK ("billedQty" >= 0),         -- maintained by bill posting
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  CONSTRAINT "grnLineTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "grnLineNoUk" UNIQUE ("tenantId", "grnId", "lineNo"),
  CONSTRAINT "grnLineHeaderFk" FOREIGN KEY ("tenantId", "grnId") REFERENCES "Purchases"."GoodsReceivedNotes" ("tenantId", id),
  CONSTRAINT "grnLinePoLineFk" FOREIGN KEY ("tenantId", "purchaseOrderLineId") REFERENCES "Purchases"."PurchaseOrderLines" ("tenantId", id),
  CONSTRAINT "grnLineQtyChk" CHECK ("receivedQty" = "acceptedQty" + "rejectedQty"),
  CONSTRAINT "grnLineReasonChk" CHECK ("rejectedQty" = 0 OR "rejectReason" IS NOT NULL),
  CONSTRAINT "grnLineAmountsChk" CHECK ("acceptedAmount" = round("acceptedQty" * "unitCost", 2)
                                         AND "rejectedAmount" = round("rejectedQty" * "unitCost", 2))
);
SELECT "Company"."addStandardTriggers"('"Purchases"."GoodsReceivedNoteLines"', true);
CREATE INDEX "grnLinePoLineIdx" ON "Purchases"."GoodsReceivedNoteLines" ("tenantId", "purchaseOrderLineId");
CREATE INDEX "grnLineItemIdx" ON "Purchases"."GoodsReceivedNoteLines" ("tenantId", "itemId");

-- ---------------------------------------------------------------------------
-- bill — ONE table for supplier invoices:
--   channel STANDARD: app/purchases/bills (list: Bill #, vendor ref, Vendor,
--     PO, Bill Date, Due, Amount, WHT, Balance, 3-way match, Status; Scan bill
--     (OCR); Pay selected) and app/purchases/bills/new (Vendor, Purchase
--     order, GRN, Vendor invoice #, Bill date, Due date, Branch, Payable
--     account, Currency, lines, Internal memo, Totals, Posting preview,
--     Approval route). src/41-acc-trade.html
--   channel COUNTER: app/purchases/voucher (Purchase Voucher PV-2026-000318:
--     Ref. No., Purchase Type Shop/Warehouse, Product Purchase on Retail
--     Price, Deal on Supply, Supplier, Supplier Bill #, Salesman Code, Due
--     Date, If Credit; Payment Mode On Credit/Cash/Bank Transfer/Cheque, Bank /
--     Cash Account, Cheque No., WHT u/s 153(1)(a) %, Amount paid now; Advance
--     Tax u/s 236G; Notes). src/44-purchase-docs.html, src/94-purchase-docs.js
-- ---------------------------------------------------------------------------
CREATE TABLE "Purchases"."VendorBills" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  channel                text NOT NULL DEFAULT 'STANDARD',  -- doc types BILL / PV
  "docNo"                 text NOT NULL,                           -- BILL-2026-000087 / PV-2026-000318
  "docDate"               date NOT NULL,                           -- Bill date
  "dueDate"               date NOT NULL,                           -- Due date (vendor terms)
  "vendorId"              uuid NOT NULL,
  "branchId"              uuid NOT NULL,
  "warehouseId"           uuid,                                    -- PV "Purchase Type" Shop/Warehouse → receiving location (stock lines)
  "purchaseOrderId"      uuid,                                    -- "Purchase order" (NULL = "— none —" → NO_PO)
  "grnId"                 uuid,                                    -- "GRN" (GRN-0412 · 29 Sep 2026)
  "vendorInvoiceNo"      text NOT NULL CHECK (length(trim("vendorInvoiceNo")) > 0),   -- Vendor invoice # / Supplier Bill # (SPL/INV/88341)
  "payableAccountId"     uuid,                                    -- "Payable account 2110 Trade Creditors"
  "currencyCode"          char(3) NOT NULL DEFAULT 'PKR' REFERENCES "Company"."Currencies"(code),
  "fxRate"                numeric(18,6) NOT NULL DEFAULT 1 CHECK ("fxRate" > 0),
  "purchaserUserId"      uuid,                                    -- PV "Salesman Code SM-001 · Usman Ali" (our purchaser)
  "costCentreId"         uuid,                                    -- "Cost centre: IT"
  "dealOnSupply"         text,                                    -- PV "Deal on Supply"
  "retailPriceDiscountPct" numeric(7,4) NOT NULL DEFAULT 0 CHECK ("retailPriceDiscountPct" BETWEEN 0 AND 100),
                                                                  -- PV "Product Purchase on Retail Price" (discount % off MRP)
  "captureMethod"         text NOT NULL DEFAULT 'MANUAL',  -- "Scan bill (OCR)"
  -- totals (Totals panel / PV Totals & Tax Summary)
  "grossAmount"           numeric(18,2) NOT NULL DEFAULT 0 CHECK ("grossAmount" >= 0),         -- Goods + Services value / PV Gross Amount
  "discountAmount"        numeric(18,2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),      -- PV Total Discount
  "netAmount"             numeric(18,2) NOT NULL DEFAULT 0,                                   -- taxable amount
  "taxAmount"             numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),           -- Input GST 18% + Input SST 15%
  "advanceTaxAmount"     numeric(18,2) NOT NULL DEFAULT 0 CHECK ("advanceTaxAmount" >= 0),   -- PV Advance Tax u/s 236G
  "totalAmount"           numeric(18,2) NOT NULL DEFAULT 0,                                   -- Bill total / list "Amount"
  "whtAmount"             numeric(18,2) NOT NULL DEFAULT 0 CHECK ("whtAmount" >= 0),           -- WHT u/s 153 withheld at bill
  "netPayableAmount"     numeric(18,2) NOT NULL DEFAULT 0,                                   -- "Net payable to vendor"
  -- counter settlement (PV step 3 "Payments & Tax")
  "payMode"               text NOT NULL DEFAULT 'CREDIT',
  "bankAccountId"        uuid,                                    -- "Bank account" (Bank Transfer / Cheque)
  "cashAccountId"        uuid,                                    -- "Cash account" (Cash from drawer)
  "chequeNo"              text,                                    -- "Cheque No."
  "chequeId"              uuid,                                    -- BankCash.Cheques issued on posting
  "paidNowAmount"        numeric(18,2) NOT NULL DEFAULT 0 CHECK ("paidNowAmount" >= 0),     -- "Amount paid now"
  "balanceAmount"         numeric(18,2) NOT NULL DEFAULT 0 CHECK ("balanceAmount" >= 0),      -- list "Balance"; maintained by trigger
  -- 3-way match & dispute
  "matchStatus"           text NOT NULL DEFAULT 'NO_PO',
  "matchVariancePct"     numeric(7,4),                            -- "Qty variance −8%" / "Price variance +4%"
  "isDisputed"            boolean NOT NULL DEFAULT false,          -- AP ageing "Disputed — wrong part supplied"
  "disputeNote"           text,
  -- lifecycle
  status                 text NOT NULL DEFAULT 'DRAFT',
  "submittedAt"           timestamptz,
  "approvedByUserId"    uuid,
  "approvedAt"            timestamptz,
  "postedAt"              timestamptz,
  "journalEntryId"       uuid,
  "voidedAt"              timestamptz,
  "voidReason"            text,
  remarks                text,                                    -- "Internal memo" / PV "Notes"
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  CONSTRAINT "billTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "billDocNoUk" UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "billVendorFk" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "Purchases"."Vendors" ("tenantId", id),
  CONSTRAINT "billBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "billPoFk" FOREIGN KEY ("tenantId", "purchaseOrderId") REFERENCES "Purchases"."PurchaseOrders" ("tenantId", id),
  CONSTRAINT "billGrnFk" FOREIGN KEY ("tenantId", "grnId") REFERENCES "Purchases"."GoodsReceivedNotes" ("tenantId", id),
  CONSTRAINT "billPurchaserFk" FOREIGN KEY ("tenantId", "purchaserUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "billApproverFk" FOREIGN KEY ("tenantId", "approvedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "billAmountsChk" CHECK ("netAmount" = "grossAmount" - "discountAmount"
                                     AND "totalAmount" = "netAmount" + "taxAmount" + "advanceTaxAmount"
                                     AND "netPayableAmount" = "totalAmount" - "whtAmount"),
  CONSTRAINT "billPaidChk" CHECK ("paidNowAmount" + "balanceAmount" <= "netPayableAmount"),
  CONSTRAINT "billDatesChk" CHECK ("dueDate" >= "docDate"),
  CONSTRAINT "billChannelModeChk" CHECK (channel = 'COUNTER' OR "payMode" = 'CREDIT'),
  CONSTRAINT "billPayModeChk" CHECK (
       ("payMode" = 'CREDIT' AND "paidNowAmount" = 0 AND "bankAccountId" IS NULL AND "cashAccountId" IS NULL)
    OR ("payMode" = 'CASH'   AND "cashAccountId" IS NOT NULL AND "bankAccountId" IS NULL)
    OR ("payMode" = 'BANK'   AND "bankAccountId" IS NOT NULL AND "cashAccountId" IS NULL)
    OR ("payMode" = 'CHEQUE' AND "bankAccountId" IS NOT NULL AND "cashAccountId" IS NULL AND "chequeNo" IS NOT NULL)),
  CONSTRAINT "billMatchChk" CHECK ("purchaseOrderId" IS NOT NULL OR "matchStatus" = 'NO_PO'),
  CONSTRAINT "billPostedChk" CHECK (status NOT IN ('POSTED','PARTIALLY_PAID','PAID') OR "postedAt" IS NOT NULL),
  CONSTRAINT "billApprovedChk" CHECK (status NOT IN ('APPROVED') OR "approvedAt" IS NOT NULL),
  CONSTRAINT "billVoidChk" CHECK (status <> 'VOID' OR ("voidedAt" IS NOT NULL
                                  AND "balanceAmount" = "netPayableAmount" - "paidNowAmount")),
  CONSTRAINT "billDisputeChk" CHECK (NOT "isDisputed" OR "disputeNote" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Purchases"."VendorBills"', true);
CREATE INDEX "billStatusDueIdx" ON "Purchases"."VendorBills" ("tenantId", status, "dueDate");
CREATE INDEX "billVendorDateIdx" ON "Purchases"."VendorBills" ("tenantId", "vendorId", "docDate" DESC);
CREATE INDEX "billChannelDateIdx" ON "Purchases"."VendorBills" ("tenantId", channel, "docDate" DESC);
CREATE INDEX "billMatchIdx" ON "Purchases"."VendorBills" ("tenantId", "matchStatus");
CREATE INDEX "billPoIdx" ON "Purchases"."VendorBills" ("tenantId", "purchaseOrderId") WHERE "purchaseOrderId" IS NOT NULL;
CREATE INDEX "billGrnIdx" ON "Purchases"."VendorBills" ("tenantId", "grnId") WHERE "grnId" IS NOT NULL;
CREATE INDEX "billOpenDueIdx" ON "Purchases"."VendorBills" ("tenantId", "dueDate")
  WHERE status IN ('POSTED','PARTIALLY_PAID') AND "balanceAmount" > 0;        -- Overdue / Due next 7 days / payment run
-- "warn on duplicate": not unique (two vendors can reuse a number; the same vendor
-- may legitimately re-issue) — the API warns when this index finds a match.
CREATE INDEX "billVendorInvoiceIdx" ON "Purchases"."VendorBills" ("tenantId", "vendorId", lower("vendorInvoiceNo"))
  WHERE status <> 'VOID';
CREATE INDEX "billVendorInvoiceTrgmIdx" ON "Purchases"."VendorBills" USING gin ("vendorInvoiceNo" gin_trgm_ops);
COMMENT ON TABLE "Purchases"."VendorBills" IS 'Vendor bill (STANDARD, BILL-) or purchase voucher (COUNTER, PV-). Input tax, WHT u/s 153 at source, 3-way match, counter pay-now.';
COMMENT ON COLUMN "Purchases"."VendorBills"."balanceAmount" IS 'netPayable − paid_now − Σ effective VendorPaymentAllocations (amount + wht). Maintained by Purchases.refreshVendorBillBalance(). OVERDUE / DUE_TODAY are derived from dueDate.';

-- VendorBillLines — Bill lines (Item / description, Account, Qty, Rate, Tax, WHT
-- section, Amount, PO ✓) and PV grid (# UPC, Product Name, Pur. Price, Sale
-- Price, Ps-Qty, Bonus, Brk, T-Qty, %GST, %Disc, Cost, Amount). LS / Shelf /
-- S/W columns are read-only stock hints from inv (not stored).
CREATE TABLE "Purchases"."VendorBillLines" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "billId"                uuid NOT NULL,
  "lineNo"                smallint NOT NULL CHECK ("lineNo" > 0),
  "itemId"                uuid,                                    -- IT-LAP-5440 · Dell Latitude 5440
  description            text,                                    -- "Freight & handling — Karachi to Lahore"
  "accountId"             uuid,                                    -- Account (1310 Inventory — IT Hardware / 5420 Freight Inward)
  "purchaseOrderLineId" uuid,
  "grnLineId"            uuid,
  upc                    text,                                    -- UPC snapshot
  "qtyCtn"                numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyCtn" >= 0),
  "qtyLoose"              numeric(18,3) NOT NULL DEFAULT 0 CHECK ("qtyLoose" >= 0),
  "baseQty"               numeric(18,3) NOT NULL CHECK ("baseQty" >= 0),            -- Qty / Ps-Qty (paid quantity)
  "bonusQty"              numeric(18,3) NOT NULL DEFAULT 0 CHECK ("bonusQty" >= 0), -- Bonus (free goods)
  "breakageQty"           numeric(18,3) NOT NULL DEFAULT 0 CHECK ("breakageQty" >= 0), -- Brk (received broken, not stocked)
  "totalQty"              numeric(18,3) GENERATED ALWAYS AS ("baseQty" + "bonusQty" - "breakageQty") STORED,  -- T-Qty → stock IN
  rate                   numeric(18,4) NOT NULL CHECK (rate >= 0),               -- Rate / Pur. Price
  "salePrice"             numeric(18,4) CHECK ("salePrice" >= 0),                  -- PV Sale Price (markup helper)
  "updateItemSalePrice" boolean NOT NULL DEFAULT false,                          -- push salePrice to Inventory.Products on posting
  "discountPct"           numeric(7,4) NOT NULL DEFAULT 0 CHECK ("discountPct" BETWEEN 0 AND 100),   -- %Disc
  "grossAmount"           numeric(18,2) NOT NULL,                                  -- PV "Cost" = Pur. Price × Ps-Qty
  "discountAmount"        numeric(18,2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),
  "netAmount"             numeric(18,2) NOT NULL,                                  -- taxable value / bill "Amount"
  "taxCodeId"            uuid,                                                    -- GST 18% / SST 15%
  "taxRate"               numeric(7,4) NOT NULL DEFAULT 0 CHECK ("taxRate" BETWEEN 0 AND 100),     -- %GST
  "taxAmount"             numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
  "totalAmount"           numeric(18,2) NOT NULL,                                  -- PV "Amount" (incl. GST)
  "whtSection"            text,   -- "WHT section"
  "whtRate"               numeric(7,4) NOT NULL DEFAULT 0 CHECK ("whtRate" BETWEEN 0 AND 100),
  "whtAmount"             numeric(18,2) NOT NULL DEFAULT 0 CHECK ("whtAmount" >= 0),
  "netUnitCost"          numeric(18,4) GENERATED ALWAYS AS (
                           CASE WHEN "baseQty" + "bonusQty" - "breakageQty" > 0
                                THEN round("netAmount" / ("baseQty" + "bonusQty" - "breakageQty"), 4) END) STORED,
                                                                  -- Bhatti PUR_NETCOST: feeds moving-average cost
  "batchId"               uuid,
  "batchNo"               text,
  "expiryDate"            date,
  "costCentreId"         uuid,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "createdBy"             uuid,
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedBy"             uuid,
  "rowVersion"            integer NOT NULL DEFAULT 0,
  CONSTRAINT "billLineTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "billLineNoUk" UNIQUE ("tenantId", "billId", "lineNo"),
  CONSTRAINT "billLineHeaderFk" FOREIGN KEY ("tenantId", "billId") REFERENCES "Purchases"."VendorBills" ("tenantId", id),
  CONSTRAINT "billLinePoLineFk" FOREIGN KEY ("tenantId", "purchaseOrderLineId") REFERENCES "Purchases"."PurchaseOrderLines" ("tenantId", id),
  CONSTRAINT "billLineGrnLineFk" FOREIGN KEY ("tenantId", "grnLineId") REFERENCES "Purchases"."GoodsReceivedNoteLines" ("tenantId", id),
  CONSTRAINT "billLineWhatChk" CHECK ("itemId" IS NOT NULL OR (description IS NOT NULL AND "accountId" IS NOT NULL)),
  CONSTRAINT "billLineQtyChk" CHECK ("baseQty" + "bonusQty" > 0 AND "breakageQty" <= "baseQty" + "bonusQty"),
  CONSTRAINT "billLineAmountsChk" CHECK ("grossAmount" = round("baseQty" * rate, 2)
                                          AND "netAmount" = "grossAmount" - "discountAmount"
                                          AND "totalAmount" = "netAmount" + "taxAmount"),
  CONSTRAINT "billLineWhtChk" CHECK ("whtAmount" = 0 OR "whtSection" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Purchases"."VendorBillLines"', true);
CREATE INDEX "billLineItemIdx" ON "Purchases"."VendorBillLines" ("tenantId", "itemId");
CREATE INDEX "billLinePoLineIdx" ON "Purchases"."VendorBillLines" ("tenantId", "purchaseOrderLineId") WHERE "purchaseOrderLineId" IS NOT NULL;
CREATE INDEX "billLineGrnLineIdx" ON "Purchases"."VendorBillLines" ("tenantId", "grnLineId") WHERE "grnLineId" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- DebitNotes — app/purchases/debit-notes (list: Debit Note #, Vendor, Date,
-- Against Bill, Reason, Value, Tax, Total, Status; New Debit Note modal:
-- Vendor, Against bill, Date, Reason, Return from warehouse, Settlement,
-- lines, Input GST reversed, WHT adjustment). src/41-acc-trade.html
-- ---------------------------------------------------------------------------
CREATE TABLE "Purchases"."DebitNotes" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"              text NOT NULL,                              -- DN-2026-000012
  "docDate"            date NOT NULL,
  "vendorId"           uuid NOT NULL,
  "branchId"           uuid NOT NULL,                              -- list shows branch (Lahore / Karachi)
  "billId"             uuid NOT NULL,                              -- "Against bill *"
  reason              text NOT NULL,
  "reasonNote"         text,                                       -- "Short supply — 1,600 cartons"
  "warehouseId"        uuid,                                       -- "Return from warehouse" (goods leave stock)
  settlement          text NOT NULL DEFAULT 'ADJUST_AGAINST_BILL',
  "netAmount"          numeric(18,2) NOT NULL DEFAULT 0 CHECK ("netAmount" >= 0),   -- Value
  "taxAmount"          numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),   -- Input GST reversed
  "totalAmount"        numeric(18,2) NOT NULL DEFAULT 0,                           -- Debit note total
  "whtAmount"          numeric(18,2) NOT NULL DEFAULT 0 CHECK ("whtAmount" >= 0),   -- "WHT adjustment (5%)"
  "creditAmount"       numeric(18,2) GENERATED ALWAYS AS ("totalAmount" - "whtAmount") STORED,   -- reduction of the payable
  "appliedAmount"      numeric(18,2) NOT NULL DEFAULT 0 CHECK ("appliedAmount" >= 0),          -- Σ VendorPaymentAllocations (trigger)
  "refundedAmount"     numeric(18,2) NOT NULL DEFAULT 0 CHECK ("refundedAmount" >= 0),
  "balanceAmount"      numeric(18,2) GENERATED ALWAYS AS ("totalAmount" - "whtAmount" - "appliedAmount" - "refundedAmount") STORED,
                                                                  -- KPI "Open Claims"
  status              text NOT NULL DEFAULT 'DRAFT',
  "postedAt"           timestamptz,
  "journalEntryId"    uuid,
  "emailedAt"          timestamptz,                                -- "created and emailed to vendor"
  "voidedAt"           timestamptz,
  "voidReason"         text,
  remarks             text,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  CONSTRAINT "debitNoteTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "debitNoteDocNoUk" UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "debitNoteVendorFk" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "Purchases"."Vendors" ("tenantId", id),
  CONSTRAINT "debitNoteBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "debitNoteBillFk" FOREIGN KEY ("tenantId", "billId") REFERENCES "Purchases"."VendorBills" ("tenantId", id),
  CONSTRAINT "debitNoteAmountsChk" CHECK ("totalAmount" = "netAmount" + "taxAmount"
                                           AND "whtAmount" <= "totalAmount"
                                           AND "appliedAmount" + "refundedAmount" <= "totalAmount" - "whtAmount"),
  CONSTRAINT "debitNoteStockChk" CHECK (reason NOT IN ('PURCHASE_RETURN','QUALITY_REJECTION') OR "warehouseId" IS NOT NULL),
  CONSTRAINT "debitNotePostedChk" CHECK (status IN ('DRAFT','VOID') OR "postedAt" IS NOT NULL),
  CONSTRAINT "debitNoteRefundChk" CHECK (status <> 'REFUNDED' OR "refundedAmount" > 0),
  CONSTRAINT "debitNoteVoidChk" CHECK (status <> 'VOID' OR ("voidedAt" IS NOT NULL AND "appliedAmount" = 0))
);
SELECT "Company"."addStandardTriggers"('"Purchases"."DebitNotes"', true);
CREATE INDEX "debitNoteStatusDateIdx" ON "Purchases"."DebitNotes" ("tenantId", status, "docDate" DESC);
CREATE INDEX "debitNoteVendorIdx" ON "Purchases"."DebitNotes" ("tenantId", "vendorId", "docDate" DESC);
CREATE INDEX "debitNoteBillIdx" ON "Purchases"."DebitNotes" ("tenantId", "billId");
COMMENT ON TABLE "Purchases"."DebitNotes" IS 'Debit note (DN-2026-000001) raised on a vendor against a bill: return / price variance / short supply / QC rejection. Reverses input tax; settled through VendorPaymentAllocations or refund.';

-- DebitNoteLines — New Debit Note lines: Item, Billed qty, Return qty, Rate, Tax, Amount
CREATE TABLE "Purchases"."DebitNoteLines" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "debitNoteId"       uuid NOT NULL,
  "lineNo"             smallint NOT NULL CHECK ("lineNo" > 0),
  "billLineId"        uuid,
  "itemId"             uuid,
  description         text,                                       -- "(dead pixel)"
  "billedQty"          numeric(18,3) CHECK ("billedQty" >= 0),      -- snapshot "Billed qty"
  "returnQty"          numeric(18,3) NOT NULL DEFAULT 0 CHECK ("returnQty" >= 0),   -- 0 for price-variance claims
  rate                numeric(18,4) NOT NULL DEFAULT 0 CHECK (rate >= 0),
  "netAmount"          numeric(18,2) NOT NULL CHECK ("netAmount" >= 0),             -- Amount
  "taxCodeId"         uuid,
  "taxRate"            numeric(7,4) NOT NULL DEFAULT 0 CHECK ("taxRate" BETWEEN 0 AND 100),
  "taxAmount"          numeric(18,2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
  "totalAmount"        numeric(18,2) NOT NULL,
  "batchId"            uuid,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  CONSTRAINT "debitNoteLineTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "debitNoteLineNoUk" UNIQUE ("tenantId", "debitNoteId", "lineNo"),
  CONSTRAINT "debitNoteLineHeaderFk" FOREIGN KEY ("tenantId", "debitNoteId") REFERENCES "Purchases"."DebitNotes" ("tenantId", id),
  CONSTRAINT "debitNoteLineBillLineFk" FOREIGN KEY ("tenantId", "billLineId") REFERENCES "Purchases"."VendorBillLines" ("tenantId", id),
  CONSTRAINT "debitNoteLineWhatChk" CHECK ("itemId" IS NOT NULL OR description IS NOT NULL),
  CONSTRAINT "debitNoteLineQtyChk" CHECK ("billedQty" IS NULL OR "returnQty" <= "billedQty"),
  CONSTRAINT "debitNoteLineAmountsChk" CHECK (("returnQty" = 0 OR "netAmount" = round("returnQty" * rate, 2))
                                                AND "totalAmount" = "netAmount" + "taxAmount")
);
SELECT "Company"."addStandardTriggers"('"Purchases"."DebitNoteLines"', true);
CREATE INDEX "debitNoteLineBillLineIdx" ON "Purchases"."DebitNoteLines" ("tenantId", "billLineId");

-- ---------------------------------------------------------------------------
-- VendorPayments — app/payables/payments (Payment Run: Payment date, Method,
-- Pay from, Cheque book / First cheque # / Crossed "A/C Payee only", Gross
-- bills settled, WHT, Bank charges, Total payment, Create payment, Bank
-- upload file; Recent payments: Payment #, Vendor, Date, Method, Bank,
-- Against, Amount, Status), "Pay selected" modal on app/purchases/bills,
-- Payments tab on app/vendors/view. src/41-acc-trade.html
-- ---------------------------------------------------------------------------
CREATE TABLE "Purchases"."VendorPayments" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "docNo"              text NOT NULL,                              -- PAY-2026-000064
  "docDate"            date NOT NULL,                              -- Payment date
  "vendorId"           uuid NOT NULL,                              -- "One payment per vendor"
  "branchId"           uuid NOT NULL,
  method              text NOT NULL,
  "bankAccountId"     uuid,                                       -- "Pay from" Meezan Bank — 0123
  "cashAccountId"     uuid,                                       -- method CASH
  "chequeNo"           text,                                       -- First cheque # CQ-6650124 (one per payment)
  "chequeId"           uuid,                                       -- BankCash.Cheques (issued) → Cheque register
  "isCrossed"          boolean NOT NULL DEFAULT true,              -- Crossed — "A/C Payee only"
  "currencyCode"       char(3) NOT NULL DEFAULT 'PKR' REFERENCES "Company"."Currencies"(code),
  "fxRate"             numeric(18,6) NOT NULL DEFAULT 1 CHECK ("fxRate" > 0),
  amount              numeric(18,2) NOT NULL CHECK (amount > 0),  -- paid to the vendor ("Amount (Rs)")
  "whtTreatment"       text NOT NULL DEFAULT 'ALREADY_WITHHELD',
  "whtSection"         text,
  "whtRate"            numeric(7,4) NOT NULL DEFAULT 0 CHECK ("whtRate" BETWEEN 0 AND 100),   -- "Withhold now · 153(1)(a) 5.5%"
  "whtAmount"          numeric(18,2) NOT NULL DEFAULT 0 CHECK ("whtAmount" >= 0),           -- Σ allocation WHT (trigger)
  "bankChargesAmount" numeric(18,2) NOT NULL DEFAULT 0 CHECK ("bankChargesAmount" >= 0),  -- "Bank charges (est.) Rs 400"
  "allocatedAmount"    numeric(18,2) NOT NULL DEFAULT 0 CHECK ("allocatedAmount" >= 0),     -- Σ allocation amount (trigger)
  "unallocatedAmount"  numeric(18,2) GENERATED ALWAYS AS (amount - "allocatedAmount") STORED, -- "Left on account"
  "paymentRunRef"     text,                                       -- groups one run "PAY-2026-000064 → 000067" / bank upload file
  status              text NOT NULL DEFAULT 'DRAFT',
  "approvedByUserId" uuid,
  "approvedAt"         timestamptz,
  "postedAt"           timestamptz,
  "clearedOn"          date,
  "journalEntryId"    uuid,
  "voidedAt"           timestamptz,
  "voidReason"         text,
  remarks             text,                                       -- "Against" free text (Aug electricity / Opening balance)
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  CONSTRAINT "vendorPaymentTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "vendorPaymentDocNoUk" UNIQUE ("tenantId", "docNo"),
  CONSTRAINT "vendorPaymentVendorFk" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "Purchases"."Vendors" ("tenantId", id),
  CONSTRAINT "vendorPaymentBranchFk" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Company"."Branches" ("tenantId", id),
  CONSTRAINT "vendorPaymentApproverFk" FOREIGN KEY ("tenantId", "approvedByUserId") REFERENCES "Company"."Users" ("tenantId", id),
  CONSTRAINT "vendorPaymentSourceChk" CHECK (
       (method = 'CASH' AND "cashAccountId" IS NOT NULL AND "bankAccountId" IS NULL)
    OR (method <> 'CASH' AND "bankAccountId" IS NOT NULL AND "cashAccountId" IS NULL)),
  CONSTRAINT "vendorPaymentChequeChk" CHECK (method <> 'CHEQUE' OR "chequeNo" IS NOT NULL),
  CONSTRAINT "vendorPaymentWhtChk" CHECK (("whtTreatment" = 'ALREADY_WITHHELD' AND "whtAmount" = 0)
                                           OR ("whtTreatment" = 'WITHHOLD_NOW' AND "whtSection" IS NOT NULL)),
  CONSTRAINT "vendorPaymentAllocChk" CHECK ("allocatedAmount" <= amount),
  CONSTRAINT "vendorPaymentPostedChk" CHECK (status IN ('DRAFT','PENDING_APPROVAL','VOID') OR "postedAt" IS NOT NULL),
  CONSTRAINT "vendorPaymentClearedChk" CHECK (status <> 'CLEARED' OR "clearedOn" IS NOT NULL),
  CONSTRAINT "vendorPaymentVoidChk" CHECK (status <> 'VOID' OR ("voidedAt" IS NOT NULL AND "allocatedAmount" = 0))
);
SELECT "Company"."addStandardTriggers"('"Purchases"."VendorPayments"', true);
CREATE INDEX "vendorPaymentDateIdx" ON "Purchases"."VendorPayments" ("tenantId", "docDate" DESC);
CREATE INDEX "vendorPaymentVendorIdx" ON "Purchases"."VendorPayments" ("tenantId", "vendorId", "docDate" DESC);
CREATE INDEX "vendorPaymentStatusIdx" ON "Purchases"."VendorPayments" ("tenantId", status, "docDate" DESC);
CREATE INDEX "vendorPaymentOnAccountIdx" ON "Purchases"."VendorPayments" ("tenantId", "vendorId")
  WHERE status IN ('POSTED','PRESENTED','CLEARED') AND "allocatedAmount" < amount;   -- "Allocate on-account"
CREATE INDEX "vendorPaymentRunIdx" ON "Purchases"."VendorPayments" ("tenantId", "paymentRunRef") WHERE "paymentRunRef" IS NOT NULL;
COMMENT ON TABLE "Purchases"."VendorPayments" IS 'Vendor payment (PAY-2026-000001): IBFT / cheque / pay order / cash from a bank or cash account; WHT already withheld at bill or withheld now.';

-- ---------------------------------------------------------------------------
-- VendorPaymentAllocations — the AP settlement ledger. Source = a vendor payment
-- (Payment Run "Pay now", "Pay selected", Allocate on-account modal) OR a
-- debit note (the "DN-2026-000012 Open debit note −22,500" row in the
-- allocation modal; DN settlement "Adjust against bill"). Target = a bill.
-- src/41-acc-trade.html (#po-pay-alloc)
-- ---------------------------------------------------------------------------
CREATE TABLE "Purchases"."VendorPaymentAllocations" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "Platform"."Tenants"(id),
  "vendorPaymentId"   uuid,
  "debitNoteId"       uuid,
  "billId"             uuid NOT NULL,
  "allocationDate"     date NOT NULL,                              -- "Allocation date"
  amount              numeric(18,2) NOT NULL CHECK (amount >= 0), -- "Pay now" / "Allocate"
  "whtAmount"          numeric(18,2) NOT NULL DEFAULT 0 CHECK ("whtAmount" >= 0),   -- WHT withheld now on this bill
  "isReversed"         boolean NOT NULL DEFAULT false,
  "reversedAt"         timestamptz,
  remarks             text,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "createdBy"          uuid,
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedBy"          uuid,
  "rowVersion"         integer NOT NULL DEFAULT 0,
  CONSTRAINT "paymentAllocationTenantIdUk" UNIQUE ("tenantId", id),
  CONSTRAINT "paymentAllocationPaymentFk" FOREIGN KEY ("tenantId", "vendorPaymentId") REFERENCES "Purchases"."VendorPayments" ("tenantId", id),
  CONSTRAINT "paymentAllocationDebitNoteFk" FOREIGN KEY ("tenantId", "debitNoteId") REFERENCES "Purchases"."DebitNotes" ("tenantId", id),
  CONSTRAINT "paymentAllocationBillFk" FOREIGN KEY ("tenantId", "billId") REFERENCES "Purchases"."VendorBills" ("tenantId", id),
  CONSTRAINT "paymentAllocationSourceChk" CHECK (num_nonnulls("vendorPaymentId", "debitNoteId") = 1),
  CONSTRAINT "paymentAllocationAmountChk" CHECK (amount + "whtAmount" > 0),
  CONSTRAINT "paymentAllocationDnWhtChk" CHECK ("debitNoteId" IS NULL OR "whtAmount" = 0),
  CONSTRAINT "paymentAllocationReversedChk" CHECK (NOT "isReversed" OR "reversedAt" IS NOT NULL)
);
SELECT "Company"."addStandardTriggers"('"Purchases"."VendorPaymentAllocations"', true);
CREATE INDEX "paymentAllocationBillIdx" ON "Purchases"."VendorPaymentAllocations" ("tenantId", "billId") WHERE NOT "isReversed";
CREATE INDEX "paymentAllocationPaymentIdx" ON "Purchases"."VendorPaymentAllocations" ("tenantId", "vendorPaymentId") WHERE "vendorPaymentId" IS NOT NULL;
CREATE INDEX "paymentAllocationDnIdx" ON "Purchases"."VendorPaymentAllocations" ("tenantId", "debitNoteId") WHERE "debitNoteId" IS NOT NULL;
COMMENT ON TABLE "Purchases"."VendorPaymentAllocations" IS 'AP settlement: a vendor payment or a debit note settles (part of) a bill. Reversed, never deleted once the source is posted.';

-- =============================================================================
-- Module functions & triggers
-- (plpgsql + record so bodies can reference inv.* tables created later)
-- =============================================================================

-- baseQty = qtyCtn × Inventory.Products.ctn + qtyLoose whenever cartons/loose are entered.
CREATE OR REPLACE FUNCTION "Purchases"."triggerBaseQty"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vItem" record;
BEGIN
  IF NEW."itemId" IS NOT NULL AND (NEW."qtyCtn" <> 0 OR NEW."qtyLoose" <> 0) THEN
    SELECT i.ctn INTO "vItem" FROM "Inventory"."Products" i
     WHERE i."tenantId" = NEW."tenantId" AND i.id = NEW."itemId";
    NEW."baseQty" := NEW."qtyCtn" * COALESCE(NULLIF("vItem".ctn, 0), 1) + NEW."qtyLoose";
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION "Purchases"."triggerBaseQty"() IS 'Derives baseQty from qtyCtn × Inventory.Products.ctn + qtyLoose (contract §4).';

-- Header lock. TG_ARGV[0] = statuses in which the document is editable (comma
-- list); TG_ARGV[1] = extra columns that may still change once locked
-- (settlement / roll-up columns). Also forbids inserting a non-draft document
-- and deleting anything that left the editable states.
CREATE OR REPLACE FUNCTION "Purchases"."triggerLockPostedHeader"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vEditable" text[] := string_to_array(TG_ARGV[0], ',');
  "vFree"     text[] := string_to_array(COALESCE(TG_ARGV[1], ''), ',')
                       || ARRAY['status','updatedAt','updatedBy','rowVersion'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT (NEW.status = ANY ("vEditable")) THEN
      RAISE EXCEPTION '%.%: insert the document as % and post it by updating its status',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, "vEditable"[1] USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF NOT (OLD.status = ANY ("vEditable")) THEN
      RAISE EXCEPTION '%.%: a % document cannot be deleted; void or cancel it',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = ANY ("vEditable") THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - "vFree") IS DISTINCT FROM (to_jsonb(OLD) - "vFree") THEN
    RAISE EXCEPTION '%.%: a % document is locked; only % may change',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.status, array_to_string("vFree", ', ')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION "Purchases"."triggerLockPostedHeader"() IS 'Posted purchase documents are immutable except for settlement/roll-up columns; corrections go through void/cancel + reversal.';

-- Line lock. TG_ARGV[0] = header table, TG_ARGV[1] = FK column to the header,
-- TG_ARGV[2] = editable header statuses, TG_ARGV[3] = counter columns that may
-- change after posting (optional).
CREATE OR REPLACE FUNCTION "Purchases"."triggerLockPostedChild"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vRow"      jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  "vEditable" text[] := string_to_array(TG_ARGV[2], ',');
  "vFree"     text[];
  "vStatus"   text;
BEGIN
  IF TG_OP = 'UPDATE' AND TG_NARGS > 3 THEN
    "vFree" := string_to_array(TG_ARGV[3], ',') || ARRAY['updatedAt','updatedBy','rowVersion'];
    IF (to_jsonb(NEW) - "vFree") = (to_jsonb(OLD) - "vFree") THEN
      RETURN NEW;                                   -- only roll-up counters changed
    END IF;
  END IF;
  EXECUTE format('SELECT status FROM %s WHERE "tenantId" = $1 AND id = $2', TG_ARGV[0])
     INTO "vStatus"
    USING ("vRow" ->> 'tenantId')::uuid, ("vRow" ->> TG_ARGV[1])::uuid;
  IF "vStatus" IS NOT NULL AND NOT ("vStatus" = ANY ("vEditable")) THEN
    RAISE EXCEPTION '%.%: lines cannot change while % is %',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_ARGV[0], "vStatus" USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

-- PO receipt / billing state from its lines (APPROVED … BILLED only).
CREATE OR REPLACE FUNCTION "Purchases"."refreshPurchaseOrderStatus"("pTenant" uuid, "pPoId" uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  "vStatus"     text;
  "vNew"        text;
  "vAllBilled" boolean;
  "vAllRecv"   boolean;
  "vAnyRecv"   boolean;
BEGIN
  SELECT po.status INTO "vStatus" FROM "Purchases"."PurchaseOrders" po
   WHERE po."tenantId" = "pTenant" AND po.id = "pPoId"
     FOR UPDATE;
  IF "vStatus" IS NULL OR "vStatus" NOT IN ('APPROVED','PARTIALLY_RECEIVED','RECEIVED','BILLED') THEN
    RETURN;
  END IF;
  SELECT bool_and(l."billedQty" >= l."baseQty" + l."bonusQty"),
         bool_and(l."receivedQty" >= l."baseQty" + l."bonusQty"),
         bool_or(l."receivedQty" > 0)
    INTO "vAllBilled", "vAllRecv", "vAnyRecv"
    FROM "Purchases"."PurchaseOrderLines" l
   WHERE l."tenantId" = "pTenant" AND l."purchaseOrderId" = "pPoId";
  "vNew" := CASE WHEN "vAllBilled" THEN 'BILLED'
                WHEN "vAllRecv"   THEN 'RECEIVED'
                WHEN "vAnyRecv"   THEN 'PARTIALLY_RECEIVED'
                ELSE 'APPROVED' END;
  IF "vNew" IS DISTINCT FROM "vStatus" THEN
    UPDATE "Purchases"."PurchaseOrders" SET status = "vNew"
     WHERE "tenantId" = "pTenant" AND id = "pPoId";
  END IF;
END $$;

-- GRN billStatus / matchStatus from billed vs accepted quantities.
CREATE OR REPLACE FUNCTION "Purchases"."refreshGoodsReceivedNoteBilling"("pTenant" uuid, "pGrnId" uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  "vAll"   boolean;
  "vAny"   boolean;
  "vExact" boolean;
  "vBill"  text;
  "vMatch" text;
BEGIN
  SELECT bool_and(g."billedQty" >= g."acceptedQty"),
         bool_or(g."billedQty" > 0),
         bool_and(g."billedQty" = g."acceptedQty")
    INTO "vAll", "vAny", "vExact"
    FROM "Purchases"."GoodsReceivedNoteLines" g
   WHERE g."tenantId" = "pTenant" AND g."grnId" = "pGrnId";
  "vBill"  := CASE WHEN COALESCE("vAny", false) AND "vAll" THEN 'BILLED'
                  WHEN COALESCE("vAny", false) THEN 'PARTIALLY_BILLED'
                  ELSE 'AWAITING' END;
  "vMatch" := CASE WHEN NOT COALESCE("vAny", false) THEN 'TWO_WAY_BILL_AWAITED'
                  WHEN "vExact" THEN 'MATCHED'
                  ELSE 'QTY_VARIANCE' END;
  UPDATE "Purchases"."GoodsReceivedNotes"
     SET "billStatus" = "vBill", "matchStatus" = "vMatch"
   WHERE "tenantId" = "pTenant" AND id = "pGrnId" AND status = 'POSTED'
     AND ("billStatus" IS DISTINCT FROM "vBill" OR "matchStatus" IS DISTINCT FROM "vMatch");
END $$;

-- GRN post (DRAFT → POSTED) adds accepted qty to the PO lines; cancel of a
-- posted, unbilled GRN takes it back.
CREATE OR REPLACE FUNCTION "Purchases"."triggerGrnStatusRollup"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vSign"      numeric;
  "vPoStatus" text;
BEGIN
  IF OLD.status = 'DRAFT' AND NEW.status = 'POSTED' THEN
    "vSign" := 1;
  ELSIF OLD.status = 'POSTED' AND NEW.status = 'CANCELLED' THEN
    "vSign" := -1;
  ELSE
    RETURN NULL;
  END IF;

  IF "vSign" > 0 AND NEW."purchaseOrderId" IS NOT NULL THEN
    SELECT po.status INTO "vPoStatus" FROM "Purchases"."PurchaseOrders" po
     WHERE po."tenantId" = NEW."tenantId" AND po.id = NEW."purchaseOrderId";
    IF "vPoStatus" NOT IN ('APPROVED','PARTIALLY_RECEIVED') THEN
      RAISE EXCEPTION 'GRN %: purchase order is %; goods can only be received against an approved, open PO',
        NEW."docNo", "vPoStatus" USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF "vSign" < 0 AND EXISTS (SELECT 1 FROM "Purchases"."GoodsReceivedNoteLines" g
                             WHERE g."tenantId" = NEW."tenantId" AND g."grnId" = NEW.id AND g."billedQty" > 0) THEN
    RAISE EXCEPTION 'GRN % is already billed; void the bill first', NEW."docNo" USING ERRCODE = 'check_violation';
  END IF;

  UPDATE "Purchases"."PurchaseOrderLines" pl
     SET "receivedQty" = pl."receivedQty" + "vSign" * s.qty
    FROM (SELECT g."purchaseOrderLineId" AS "refId", sum(g."acceptedQty") AS qty
            FROM "Purchases"."GoodsReceivedNoteLines" g
           WHERE g."tenantId" = NEW."tenantId" AND g."grnId" = NEW.id
             AND g."purchaseOrderLineId" IS NOT NULL
           GROUP BY g."purchaseOrderLineId") s
   WHERE pl."tenantId" = NEW."tenantId" AND pl.id = s."refId";

  IF NEW."purchaseOrderId" IS NOT NULL THEN
    PERFORM "Purchases"."refreshPurchaseOrderStatus"(NEW."tenantId", NEW."purchaseOrderId");
  END IF;
  RETURN NULL;
END $$;

-- Bill defaults: balance follows the totals until posting; a counter purchase
-- posted with "paid now" lands directly in PARTIALLY_PAID / PAID; a bill with
-- live settlements cannot be voided.
CREATE OR REPLACE FUNCTION "Purchases"."triggerBillDefaults"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status IN ('DRAFT','AWAITING_APPROVAL','APPROVED') THEN
    NEW."balanceAmount" := NEW."netPayableAmount" - NEW."paidNowAmount";
    IF NEW.status = 'POSTED' AND NEW."paidNowAmount" > 0 THEN
      NEW.status := CASE WHEN NEW."balanceAmount" = 0 THEN 'PAID' ELSE 'PARTIALLY_PAID' END;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'VOID' AND OLD.status <> 'VOID'
     AND EXISTS (SELECT 1 FROM "Purchases"."VendorPaymentAllocations" a
                  WHERE a."tenantId" = NEW."tenantId" AND a."billId" = NEW.id AND NOT a."isReversed") THEN
    RAISE EXCEPTION 'Bill % has payments or debit notes allocated; reverse them before voiding', NEW."docNo"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- Bill post adds billed qty to PO lines and GRN lines; void takes it back.
CREATE OR REPLACE FUNCTION "Purchases"."triggerBillStatusRollup"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vSign" numeric;
  "vRef"  record;
BEGIN
  IF OLD.status IN ('DRAFT','AWAITING_APPROVAL','APPROVED') AND NEW.status IN ('POSTED','PARTIALLY_PAID','PAID') THEN
    "vSign" := 1;
  ELSIF OLD.status IN ('POSTED','PARTIALLY_PAID','PAID') AND NEW.status = 'VOID' THEN
    "vSign" := -1;
  ELSE
    RETURN NULL;
  END IF;

  UPDATE "Purchases"."PurchaseOrderLines" pl
     SET "billedQty" = pl."billedQty" + "vSign" * s.qty
    FROM (SELECT bl."purchaseOrderLineId" AS "refId", sum(bl."baseQty" + bl."bonusQty") AS qty
            FROM "Purchases"."VendorBillLines" bl
           WHERE bl."tenantId" = NEW."tenantId" AND bl."billId" = NEW.id
             AND bl."purchaseOrderLineId" IS NOT NULL
           GROUP BY bl."purchaseOrderLineId") s
   WHERE pl."tenantId" = NEW."tenantId" AND pl.id = s."refId";

  UPDATE "Purchases"."GoodsReceivedNoteLines" gl
     SET "billedQty" = gl."billedQty" + "vSign" * s.qty
    FROM (SELECT bl."grnLineId" AS "refId", sum(bl."baseQty" + bl."bonusQty") AS qty
            FROM "Purchases"."VendorBillLines" bl
           WHERE bl."tenantId" = NEW."tenantId" AND bl."billId" = NEW.id
             AND bl."grnLineId" IS NOT NULL
           GROUP BY bl."grnLineId") s
   WHERE gl."tenantId" = NEW."tenantId" AND gl.id = s."refId";

  FOR "vRef" IN
    SELECT DISTINCT pl."purchaseOrderId" AS "refId"
      FROM "Purchases"."VendorBillLines" bl
      JOIN "Purchases"."PurchaseOrderLines" pl
        ON pl."tenantId" = bl."tenantId" AND pl.id = bl."purchaseOrderLineId"
     WHERE bl."tenantId" = NEW."tenantId" AND bl."billId" = NEW.id
  LOOP
    PERFORM "Purchases"."refreshPurchaseOrderStatus"(NEW."tenantId", "vRef"."refId");
  END LOOP;

  FOR "vRef" IN
    SELECT DISTINCT gl."grnId" AS "refId"
      FROM "Purchases"."VendorBillLines" bl
      JOIN "Purchases"."GoodsReceivedNoteLines" gl
        ON gl."tenantId" = bl."tenantId" AND gl.id = bl."grnLineId"
     WHERE bl."tenantId" = NEW."tenantId" AND bl."billId" = NEW.id
  LOOP
    PERFORM "Purchases"."refreshGoodsReceivedNoteBilling"(NEW."tenantId", "vRef"."refId");
  END LOOP;
  RETURN NULL;
END $$;

-- Bill balance = net payable − paid now − effective settlements (allocations
-- whose source payment is posted / DN is open or settled).
CREATE OR REPLACE FUNCTION "Purchases"."refreshVendorBillBalance"("pTenant" uuid, "pBillId" uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  "vBill"    record;
  "vSettled" numeric(18,2);
  "vBal"     numeric(18,2);
  "vStatus"  text;
BEGIN
  SELECT b."docNo", b.status, b."netPayableAmount", b."paidNowAmount" INTO "vBill"
    FROM "Purchases"."VendorBills" b
   WHERE b."tenantId" = "pTenant" AND b.id = "pBillId"
     FOR UPDATE;
  IF NOT FOUND OR "vBill".status NOT IN ('POSTED','PARTIALLY_PAID','PAID') THEN
    RETURN;
  END IF;
  SELECT COALESCE(sum(a.amount + a."whtAmount"), 0) INTO "vSettled"
    FROM "Purchases"."VendorPaymentAllocations" a
    LEFT JOIN "Purchases"."VendorPayments" p ON p."tenantId" = a."tenantId" AND p.id = a."vendorPaymentId"
    LEFT JOIN "Purchases"."DebitNotes" d     ON d."tenantId" = a."tenantId" AND d.id = a."debitNoteId"
   WHERE a."tenantId" = "pTenant" AND a."billId" = "pBillId" AND NOT a."isReversed"
     AND (p.status IN ('POSTED','PRESENTED','CLEARED') OR d.status IN ('OPEN','APPLIED','REFUNDED'));
  "vBal" := "vBill"."netPayableAmount" - "vBill"."paidNowAmount" - "vSettled";
  IF "vBal" < 0 THEN
    RAISE EXCEPTION 'Bill % is over-settled by %', "vBill"."docNo", -"vBal" USING ERRCODE = 'check_violation';
  END IF;
  "vStatus" := CASE WHEN "vBal" = 0 THEN 'PAID'
                   WHEN "vBal" < "vBill"."netPayableAmount" THEN 'PARTIALLY_PAID'
                   ELSE 'POSTED' END;
  UPDATE "Purchases"."VendorBills"
     SET "balanceAmount" = "vBal", status = "vStatus"
   WHERE "tenantId" = "pTenant" AND id = "pBillId"
     AND ("balanceAmount" IS DISTINCT FROM "vBal" OR status IS DISTINCT FROM "vStatus");
END $$;

-- Payment allocated / WHT totals.
CREATE OR REPLACE FUNCTION "Purchases"."refreshVendorPaymentAllocation"("pTenant" uuid, "pPaymentId" uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  "vPay"   record;
  "vAlloc" numeric(18,2);
  "vWht"   numeric(18,2);
BEGIN
  SELECT p."docNo", p.amount INTO "vPay"
    FROM "Purchases"."VendorPayments" p
   WHERE p."tenantId" = "pTenant" AND p.id = "pPaymentId"
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT COALESCE(sum(a.amount), 0), COALESCE(sum(a."whtAmount"), 0) INTO "vAlloc", "vWht"
    FROM "Purchases"."VendorPaymentAllocations" a
   WHERE a."tenantId" = "pTenant" AND a."vendorPaymentId" = "pPaymentId" AND NOT a."isReversed";
  IF "vAlloc" > "vPay".amount THEN
    RAISE EXCEPTION 'Payment % allocated % more than its amount', "vPay"."docNo", "vAlloc" - "vPay".amount
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE "Purchases"."VendorPayments"
     SET "allocatedAmount" = "vAlloc", "whtAmount" = "vWht"
   WHERE "tenantId" = "pTenant" AND id = "pPaymentId"
     AND ("allocatedAmount" IS DISTINCT FROM "vAlloc" OR "whtAmount" IS DISTINCT FROM "vWht");
END $$;

-- Debit note applied amount and OPEN / APPLIED / REFUNDED state.
CREATE OR REPLACE FUNCTION "Purchases"."refreshDebitNoteSettlement"("pTenant" uuid, "pDnId" uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  "vDn"      record;
  "vApplied" numeric(18,2);
  "vBal"     numeric(18,2);
  "vStatus"  text;
BEGIN
  SELECT d."docNo", d.status, d."totalAmount", d."whtAmount", d."refundedAmount" INTO "vDn"
    FROM "Purchases"."DebitNotes" d
   WHERE d."tenantId" = "pTenant" AND d.id = "pDnId"
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT COALESCE(sum(a.amount), 0) INTO "vApplied"
    FROM "Purchases"."VendorPaymentAllocations" a
   WHERE a."tenantId" = "pTenant" AND a."debitNoteId" = "pDnId" AND NOT a."isReversed";
  "vBal" := "vDn"."totalAmount" - "vDn"."whtAmount" - "vApplied" - "vDn"."refundedAmount";
  IF "vBal" < 0 THEN
    RAISE EXCEPTION 'Debit note % applied % more than its credit', "vDn"."docNo", -"vBal"
      USING ERRCODE = 'check_violation';
  END IF;
  "vStatus" := CASE WHEN "vDn".status IN ('DRAFT','VOID') THEN "vDn".status
                   WHEN "vBal" > 0 THEN 'OPEN'
                   WHEN "vDn"."refundedAmount" > 0 THEN 'REFUNDED'
                   ELSE 'APPLIED' END;
  UPDATE "Purchases"."DebitNotes"
     SET "appliedAmount" = "vApplied", status = "vStatus"
   WHERE "tenantId" = "pTenant" AND id = "pDnId"
     AND ("appliedAmount" IS DISTINCT FROM "vApplied" OR status IS DISTINCT FROM "vStatus");
END $$;

-- Allocation guard: same vendor on both sides, bill posted, source not void;
-- once the source is posted an allocation is reversed, never edited/deleted.
CREATE OR REPLACE FUNCTION "Purchases"."triggerPaymentAllocationCheck"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vRow"  record;
  "vBill" record;
  "vSrc"  record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    "vRow" := OLD;
  ELSE
    "vRow" := NEW;
  END IF;

  IF "vRow"."vendorPaymentId" IS NOT NULL THEN
    SELECT p."vendorId", p.status, p.status IN ('DRAFT','PENDING_APPROVAL') AS "isDraft" INTO "vSrc"
      FROM "Purchases"."VendorPayments" p
     WHERE p."tenantId" = "vRow"."tenantId" AND p.id = "vRow"."vendorPaymentId";
  ELSE
    SELECT d."vendorId", d.status, d.status = 'DRAFT' AS "isDraft" INTO "vSrc"
      FROM "Purchases"."DebitNotes" d
     WHERE d."tenantId" = "vRow"."tenantId" AND d.id = "vRow"."debitNoteId";
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT COALESCE("vSrc"."isDraft", true) THEN
      RAISE EXCEPTION 'Allocation of a posted payment/debit note cannot be deleted; reverse it'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT COALESCE("vSrc"."isDraft", true)
     AND (to_jsonb(NEW) - ARRAY['isReversed','reversedAt','remarks','updatedAt','updatedBy','rowVersion'])
         IS DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['isReversed','reversedAt','remarks','updatedAt','updatedBy','rowVersion']) THEN
    RAISE EXCEPTION 'Allocation of a posted payment/debit note can only be reversed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."isReversed" AND NOT NEW."isReversed" THEN
    RAISE EXCEPTION 'A reversed allocation cannot be reinstated; create a new one' USING ERRCODE = 'check_violation';
  END IF;

  SELECT b."vendorId", b.status, b."docNo" INTO "vBill"
    FROM "Purchases"."VendorBills" b
   WHERE b."tenantId" = NEW."tenantId" AND b.id = NEW."billId";
  IF NOT NEW."isReversed" THEN
    IF "vBill".status NOT IN ('POSTED','PARTIALLY_PAID','PAID') THEN
      RAISE EXCEPTION 'Bill % is %; only posted bills can be settled', "vBill"."docNo", "vBill".status
        USING ERRCODE = 'check_violation';
    END IF;
    IF "vSrc"."vendorId" IS DISTINCT FROM "vBill"."vendorId" THEN
      RAISE EXCEPTION 'Allocation vendor mismatch on bill %', "vBill"."docNo" USING ERRCODE = 'check_violation';
    END IF;
    IF "vSrc".status = 'VOID' THEN
      RAISE EXCEPTION 'A void payment/debit note cannot be allocated' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Allocation roll-up to bill, payment and debit note.
CREATE OR REPLACE FUNCTION "Purchases"."triggerPaymentAllocationRollup"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM "Purchases"."refreshVendorBillBalance"(OLD."tenantId", OLD."billId");
    IF OLD."vendorPaymentId" IS NOT NULL THEN
      PERFORM "Purchases"."refreshVendorPaymentAllocation"(OLD."tenantId", OLD."vendorPaymentId");
    END IF;
    IF OLD."debitNoteId" IS NOT NULL THEN
      PERFORM "Purchases"."refreshDebitNoteSettlement"(OLD."tenantId", OLD."debitNoteId");
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM "Purchases"."refreshVendorBillBalance"(NEW."tenantId", NEW."billId");
    IF NEW."vendorPaymentId" IS NOT NULL THEN
      PERFORM "Purchases"."refreshVendorPaymentAllocation"(NEW."tenantId", NEW."vendorPaymentId");
    END IF;
    IF NEW."debitNoteId" IS NOT NULL THEN
      PERFORM "Purchases"."refreshDebitNoteSettlement"(NEW."tenantId", NEW."debitNoteId");
    END IF;
  END IF;
  RETURN NULL;
END $$;

-- When a payment / debit note changes status (posted, cleared, void …) the
-- bills it settles are re-balanced.
CREATE OR REPLACE FUNCTION "Purchases"."triggerSettlementSourceRollup"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  "vRef" record;
BEGIN
  FOR "vRef" IN
    SELECT DISTINCT a."billId" AS "refId"
      FROM "Purchases"."VendorPaymentAllocations" a
     WHERE a."tenantId" = NEW."tenantId"
       AND ((TG_TABLE_NAME = 'VendorPayments' AND a."vendorPaymentId" = NEW.id)
         OR (TG_TABLE_NAME = 'DebitNotes'     AND a."debitNoteId"     = NEW.id))
  LOOP
    PERFORM "Purchases"."refreshVendorBillBalance"(NEW."tenantId", "vRef"."refId");
  END LOOP;
  IF TG_TABLE_NAME = 'DebitNotes' AND OLD.status = 'DRAFT' AND NEW.status <> 'DRAFT' THEN
    PERFORM "Purchases"."refreshDebitNoteSettlement"(NEW."tenantId", NEW.id);
  END IF;
  RETURN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Trigger wiring
-- ---------------------------------------------------------------------------
-- carton/loose → base qty
CREATE TRIGGER "purchaseOrderLineBaseQty" BEFORE INSERT OR UPDATE OF "qtyCtn", "qtyLoose", "itemId"
  ON "Purchases"."PurchaseOrderLines" FOR EACH ROW EXECUTE FUNCTION "Purchases"."triggerBaseQty"();
CREATE TRIGGER "billLineBaseQty" BEFORE INSERT OR UPDATE OF "qtyCtn", "qtyLoose", "itemId"
  ON "Purchases"."VendorBillLines" FOR EACH ROW EXECUTE FUNCTION "Purchases"."triggerBaseQty"();

-- header locks
CREATE TRIGGER "purchaseOrderLock" BEFORE INSERT OR UPDATE OR DELETE ON "Purchases"."PurchaseOrders"
  FOR EACH ROW EXECUTE FUNCTION "Purchases"."triggerLockPostedHeader"(
    'DRAFT,PENDING_L1,PENDING_L2', 'sentToVendorAt,cancelledAt,cancelReason');
CREATE TRIGGER "grnLock" BEFORE INSERT OR UPDATE OR DELETE ON "Purchases"."GoodsReceivedNotes"
  FOR EACH ROW EXECUTE FUNCTION "Purchases"."triggerLockPostedHeader"(
    'DRAFT', 'billStatus,matchStatus,cancelledAt,cancelReason');
CREATE TRIGGER "billLock" BEFORE INSERT OR UPDATE OR DELETE ON "Purchases"."VendorBills"
  FOR EACH ROW EXECUTE FUNCTION "Purchases"."triggerLockPostedHeader"(
    'DRAFT,AWAITING_APPROVAL,APPROVED', 'balanceAmount,isDisputed,disputeNote,voidedAt,voidReason');
CREATE TRIGGER "debitNoteLock" BEFORE INSERT OR UPDATE OR DELETE ON "Purchases"."DebitNotes"
  FOR EACH ROW EXECUTE FUNCTION "Purchases"."triggerLockPostedHeader"(
    'DRAFT', 'appliedAmount,refundedAmount,creditAmount,balanceAmount,emailedAt,voidedAt,voidReason');
CREATE TRIGGER "vendorPaymentLock" BEFORE INSERT OR UPDATE OR DELETE ON "Purchases"."VendorPayments"
  FOR EACH ROW EXECUTE FUNCTION "Purchases"."triggerLockPostedHeader"(
    'DRAFT,PENDING_APPROVAL', 'allocatedAmount,unallocatedAmount,whtAmount,clearedOn,voidedAt,voidReason');

-- line locks
CREATE TRIGGER "purchaseOrderLineLock" BEFORE INSERT OR UPDATE OR DELETE ON "Purchases"."PurchaseOrderLines"
  FOR EACH ROW EXECUTE FUNCTION "Purchases"."triggerLockPostedChild"(
    '"Purchases"."PurchaseOrders"', 'purchaseOrderId', 'DRAFT,PENDING_L1,PENDING_L2', 'receivedQty,billedQty');
CREATE TRIGGER "grnLineLock" BEFORE INSERT OR UPDATE OR DELETE ON "Purchases"."GoodsReceivedNoteLines"
  FOR EACH ROW EXECUTE FUNCTION "Purchases"."triggerLockPostedChild"(
    '"Purchases"."GoodsReceivedNotes"', 'grnId', 'DRAFT', 'billedQty');
CREATE TRIGGER "billLineLock" BEFORE INSERT OR UPDATE OR DELETE ON "Purchases"."VendorBillLines"
  FOR EACH ROW EXECUTE FUNCTION "Purchases"."triggerLockPostedChild"(
    '"Purchases"."VendorBills"', 'billId', 'DRAFT,AWAITING_APPROVAL,APPROVED');
CREATE TRIGGER "debitNoteLineLock" BEFORE INSERT OR UPDATE OR DELETE ON "Purchases"."DebitNoteLines"
  FOR EACH ROW EXECUTE FUNCTION "Purchases"."triggerLockPostedChild"(
    '"Purchases"."DebitNotes"', 'debitNoteId', 'DRAFT');

-- roll-ups
CREATE TRIGGER "billDefaults" BEFORE INSERT OR UPDATE ON "Purchases"."VendorBills"
  FOR EACH ROW EXECUTE FUNCTION "Purchases"."triggerBillDefaults"();
CREATE TRIGGER "grnStatusRollup" AFTER UPDATE OF status ON "Purchases"."GoodsReceivedNotes"
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION "Purchases"."triggerGrnStatusRollup"();
CREATE TRIGGER "billStatusRollup" AFTER UPDATE OF status ON "Purchases"."VendorBills"
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION "Purchases"."triggerBillStatusRollup"();
CREATE TRIGGER "paymentAllocationCheck" BEFORE INSERT OR UPDATE OR DELETE ON "Purchases"."VendorPaymentAllocations"
  FOR EACH ROW EXECUTE FUNCTION "Purchases"."triggerPaymentAllocationCheck"();
CREATE TRIGGER "paymentAllocationRollup" AFTER INSERT OR UPDATE OR DELETE ON "Purchases"."VendorPaymentAllocations"
  FOR EACH ROW EXECUTE FUNCTION "Purchases"."triggerPaymentAllocationRollup"();
CREATE TRIGGER "vendorPaymentStatusRollup" AFTER UPDATE OF status ON "Purchases"."VendorPayments"
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION "Purchases"."triggerSettlementSourceRollup"();
CREATE TRIGGER "debitNoteStatusRollup" AFTER UPDATE OF status ON "Purchases"."DebitNotes"
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION "Purchases"."triggerSettlementSourceRollup"();
