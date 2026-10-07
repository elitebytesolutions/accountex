# Phase 7 rev 1: Parties

**Objective:** the customer and vendor masters every sales and purchase document needs:
- customer groups and customers, with their contacts, delivery addresses and notes;
- vendor categories and vendors, with their contacts and bank accounts;
- the tax profile of each party (NTN / STRN / CNIC, ATL status, WHT section, further tax), credit terms and GL accounts.

Every change is attributed to the user in row history. Nothing posts yet.

**Entities (4, MASTER):** Customer Groups · Customers · Vendor Categories · Vendors

**Status before this plan:** Phases 0–6 `done`; no phase in progress.

**Decisions taken with you:**
- **Groups and categories in a drawer** opened from the Customers / Vendors list pages ("Groups", "Categories" buttons): template-styled table + form + history. No extra sidebar items.
- **Opening balance hidden until Phase 16** (General ledger · Opening Balances posts them), so the master and the ledger never disagree.
- **No seed data:** customer groups and vendor categories start empty.

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|
| Customer Groups | Master | none | Customers are grouped for filters, reports and (Phase 9) price lists |
| Customers | Master | Customer groups (this phase), branches & users (done), chart of accounts (done) | Quotes, orders, invoices and receipts (Phases 21–24) |
| Vendor Categories | Master | none | Vendors are categorised for filters and reports |
| Vendors | Master | Vendor categories (this phase), chart of accounts (done), currencies (done) | Purchase orders, GRNs, bills and payments (Phases 19–22); products' suppliers (Phase 8) |

## 2. Verified schema (live DB; all 9 tables are empty; all have RLS)

**Customer Groups** (`Sales.CustomerGroups`; **audit trigger missing → added**)
- `code` `^[A-Z0-9][A-Z0-9_-]{0,19}$` (unique), `name`, `priceListId` (→ `Sales.PriceLists`, Phase 9: not offered yet), `isActive`, `remarks`, `deletedAt`.
- DB function `customerGroupAddUpdate`.

**Customers** (`Sales.Customers`; audited) and children
- **Identity:** `code` (unique; auto `CUST-0001`), `name`, `displayName`, `customerType` COMPANY / INDIVIDUAL / GOVERNMENT / AOP, `customerGroupId`, `salesRepUserId`, `branchId`, `customerSince`, `customerChannel` STANDARD / WHOLESALE.
- **Tax:** `ntn` `^\d{7}-\d$`, `cnic` `^\d{5}-\d{7}-\d$`, `strn` `^\d{2}-\d{2}-\d{4}-\d{3}-\d{2}$`, `atlStatus` ACTIVE / NOT_ON_ATL, `isSalesTaxRegistered`, `applyFurtherTax`, `deductsWht`, `whtSection`, `whtRate` 0–100, `isGstExempt`.
- **Contact & address:** `contactPerson`, `mobile`, `phone`, `email`, `billingAddress`, `area`, `city`, `province` (lookup), `shippingSameAsBilling`, `shippingAddress`.
- **Credit & accounting:** `creditLimit` ≥ 0, `paymentTerms` NET_15 / NET_30 / … / COD, `creditDays` 0–365, `receivableAccountId` (GL), `blockOverLimit`, `autoReminders`.
- **Guarantor** (individual customers): name, father's name, CNIC (same format), phone, address.
- **Status:** ACTIVE / ON_HOLD / DISPUTED / INACTIVE; `holdReason` OVER_LIMIT / OVERDUE / BOUNCED_CHEQUE / MANUAL; `onHoldSince`; `deletedAt`.
- **Later phases (not offered now):** `priceListId`, `priceTier`, `priceTierFactor` (Phase 9 pricing); `openingBalance`, `openingBalanceAsOf` (Phase 16).
- **Children:** `CustomerContacts` (name, designation, mobile, phone, email, `isPrimary` — one per customer, `receivesInvoices`), `CustomerAddresses` (`addressType` BILLING / SHIPPING / BOTH, label, address, area, city, province, contact, `isDefault` — one per type), `CustomerNotes` (author, text ≤ 4000; no soft delete). **Audit triggers missing on all three → added.**
- DB function `customerAddUpdate` (children as arrays, rows missing from an array are hard-deleted).

**Vendor Categories** (`Purchases.VendorCategories`; **audit trigger missing → added**)
- `name` (unique, case-insensitive among live rows), `sortOrder`, `isActive`, `deletedAt`. No code column.
- DB function `vendorCategoryAddUpdate`.

**Vendors** (`Purchases.Vendors`; audited) and children
- `code` `^VEN-[0-9]{4,}$` (unique; auto), `name`, `legalName`, `categoryId`, `ntn`, `cnic`, `strn`;
- `atlStatus` ACTIVE / NOT_ON_ATL / UNVERIFIED (manual until the FBR integration, Phase 28), `atlVerifiedAt`, `defaultWhtSection` 153(1)(a) / (b) / (c) / EXEMPT;
- `defaultAccountId` (expense or inventory GL), `payableAccountId` (GL), `paymentTerms` ADVANCE / ON_RECEIPT / NET_7 … NET_90, `creditDays` 0–365 (**0 for ADVANCE / ON_RECEIPT**), `currencyCode`, `countryCode`;
- `phone`, `email`, `address`, `city`, `bankName`, `iban` (PK IBAN format), `vendorSince`, `status` ACTIVE / INACTIVE, `remarks`, `deletedAt`.
- **Children:** `VendorContacts` (name, designation, phone, mobile, email, `isPrimary` — one per vendor; **audit trigger missing → added**), `VendorBankAccounts` (bank, branch, title, account no., IBAN, SWIFT, currency, `isPrimary` — one per vendor, `isActive`; audited).
- DB function `vendorAddUpdate` (contacts and bank accounts as arrays, hard-delete of missing rows).

**Permissions** (in the catalogue): `cust:*` for customer groups and customers; `vend:*` for vendor categories and vendors.

**Unresolved:** none.

## 3. Template → page mapping
| Entity | Template | Page / component | Notes |
|---|---|---|---|
| Customers (list) | `41-acc-trade.html` `app/customers` | `/customers` | **From the template:** KPI tiles, search, city and group filters, status chips (All / Active / On hold / Disputed / Inactive), the customers table (avatar, name, code · group, NTN, city, terms, credit limit, status). **Real but empty until invoicing (Phase 23):** Total receivable, Overdue, Utilisation, Balance, Overdue columns read Rs 0 / —. **Changed:** "Near limit" / "Overdue" statuses come with invoices. **Omitted:** Import (Phase 35 importer), Export, Columns picker. **Added:** "Groups" button → drawer. |
| Customers (create / edit) | `trd-new-customer` modal | Wide drawer with the template's four sections (basic information, tax registration, contact & address, credit & accounting) | **Hidden for now:** price list (Phase 9), opening balance and "as of" (Phase 16). **Added:** shipping address when "same as billing" is off; guarantor fields for individual customers; status with hold reason. |
| Customers (detail) | `app/customers/view` | `/customers/[id]` | **From the template:** header card (avatar, name, code · group · since · address, badges: ATL, STRN registered, sales rep, status), Edit, KPI tiles, tabs. **Overview:** customer details list. **Contacts:** the template's contact cards + add / edit / remove. **Notes:** add-note form + list (author, date). **Added tab:** Addresses (delivery addresses, the `CustomerAddresses` table). **Placeholders until their phases:** Invoices, Receipts, Statement (Phase 23–24), sales trend and recent activity, "New invoice", "Receive payment", "Email statement". **Added:** History tab. |
| Customer Groups | none | Drawer from `/customers` | Table (code, name, customers, active) + form + history. |
| Vendors (list) | `41-acc-trade.html` `app/vendors` | `/vendors` | **From the template:** KPI tiles (active vendors / categories, total payable, overdue, not on ATL), search, category filter, chips (All / Active taxpayer / Not on ATL / With balance), table (avatar, name, code, category, NTN, city, filer status, WHT, payable, overdue). **Payable / overdue read 0 until bills (Phase 21). Disabled with a note:** "Verify ATL" (Phase 28). **Omitted:** Export, Columns. **Added:** "Categories" button → drawer. |
| Vendors (create / edit) | `trd-new-vendor` modal | Wide drawer with the template's two sections (identity & tax, contact & payment) | The template's contact person, phone, email, bank and IBAN become the vendor's **primary contact** and **primary bank account** rows (bank / IBAN also copied to the vendor row in the same save). **Added:** legal name, payable account, credit days, STRN, ATL status, remarks, additional contacts and bank accounts (in the drawer). |
| Vendors (detail) | `app/vendors/view` | `/vendors/[id]` | **From the template:** header card (badges: ATL, STRN registered, WHT section), Edit, KPI tiles, Overview (vendor details, primary contact). **Placeholders:** Bills, Payments, Statement, Documents, Performance, "New bill", "Pay vendor". **Added:** History tab. |
| Vendor Categories | none | Drawer from `/vendors` | Table (name, vendors, order, active) + form + history. |

**Sidebar:** new groups as in the template:
- **Sales & Receivables** › Receivables › Customers;
- **Purchases & Payables** › Payables › Vendors.

The customer / vendor detail pages are reached from the lists (not in the sidebar).

## 4. Clean Architecture
| Layer | Module | Responsibility |
|---|---|---|
| Contracts | `src/shared/parties/{customer-group,customer,vendor-category,vendor}.ts` | Zod mirrors of the DB checks (NTN / CNIC / STRN / IBAN / SWIFT formats, credit days 0–365, terms ⇔ days, WHT rate 0–100); `patchFields` for PATCH bodies |
| Domain | `parties/domain/codes.ts` | Next free `CUST-0001` / `VEN-0001` (codes ever used are skipped) |
| Application | services per entity | Auto codes; retired codes; GL checks via `GlLinks` (receivable = asset class 1, payable = liability class 2, vendor default = class 1 or 5); group / category / branch / sales rep active; hold rules (ON_HOLD needs a reason, `onHoldSince` stamped); one primary contact / bank account / default address per type; vendor's primary bank mirrored to its row; in-use checks (`isReferenced`) |
| Infrastructure | Prisma stores via the `*AddUpdate` functions | Persistence |
| Server adapter | `/api/sales/customer-groups`, `/api/sales/customers` (+ `/:id/contacts`, `/:id/addresses`, `/:id/notes`), `/api/purchases/vendor-categories`, `/api/purchases/vendors` (+ `/:id/contacts`, `/:id/bank-accounts`), form-options endpoints | Guards, Zod, unit of work |
| UI | `src/features/parties/*` | Screens above |

## 5. API contracts (under `/api`, tenant from the session)
| Method & path | Notes | Permission | Errors |
|---|---|---|---|
| `GET/POST /sales/customer-groups`, `PATCH/DELETE /:id`, `POST /:id/activate`, `/deactivate` | List carries customer counts | `cust:*` | 409 duplicate code; 409 `CUSTOMER_GROUP_IN_USE` |
| `GET /sales/customers?search&status&group&city&page&pageSize&sort` → `{ items, total }`; `GET /:id`; `POST`; `PATCH /:id`; `POST /:id/activate`, `/deactivate`, `/hold` `{ reason }`, `/release`; `DELETE /:id` | Code auto when blank | `cust:*` | 400 formats; 422 `ACCOUNT_NOT_POSTABLE`; 400 inactive group / branch / sales rep; 409 `CUSTOMER_IN_USE` |
| `POST /sales/customers/:id/contacts`, `PATCH/DELETE /sales/customer-contacts/:id`; same for `addresses`, `notes` (notes: add, delete own) | Making a contact primary / an address default moves the flag | `cust:edit` (notes: `cust:view` to add) | 403 deleting someone else's note |
| `GET /sales/customers/form-options` | Groups, branches, sales reps, receivable accounts (no Finance permission needed) | `cust:view` | |
| `GET/POST /purchases/vendor-categories`, `PATCH/DELETE /:id`, `POST /:id/activate`, `/deactivate` | List carries vendor counts | `vend:*` | 409 duplicate name; 409 `VENDOR_CATEGORY_IN_USE` |
| `GET /purchases/vendors?search&status&category&atl&page&pageSize&sort`; `GET /:id`; `POST` (with optional primary contact + bank); `PATCH /:id`; `POST /:id/activate`, `/deactivate`; `DELETE /:id` | | `vend:*` | 400 formats / terms vs days; 422 `ACCOUNT_NOT_POSTABLE`; 409 `VENDOR_IN_USE` |
| `POST /purchases/vendors/:id/contacts`, `PATCH/DELETE /purchases/vendor-contacts/:id`; same for `bank-accounts` | Primary moves | `vend:edit` | |
| `GET /purchases/vendors/form-options` | Categories, currencies, accounts | `vend:view` | |

- **Delete vs deactivate:** delete only when unused (`isReferenced`); soft delete (children with it). Otherwise deactivate. Codes are never reused.
- **Concurrency:** `rowVersion` everywhere.
- **Lists:** customers and vendors are server-paged (they grow); groups and categories are loaded whole.
- **Statements** (`GET …/:id/statement`): Phase 23 / 21, when there are documents.

## 6. Database changes: `prisma/sql/013-parties.sql` (idempotent, added to `db:sql`)
1. **Audit triggers** on `CustomerGroups`, `CustomerContacts`, `CustomerAddresses`, `CustomerNotes`, `VendorCategories`, `VendorContacts`.
2. **Child save functions** in the generated style: `customerContactAddUpdate`, `customerAddressAddUpdate`, `customerNoteAddUpdate`, `vendorContactAddUpdate`, `vendorBankAccountAddUpdate`. Children are edited one at a time from the detail tabs; the parents' array saves would rewrite the parent row (version, history) on every child change (same reason as sub types in Phase 6).
3. **Error codes:** `CUSTOMER_GROUP_IN_USE`, `CUSTOMER_IN_USE`, `VENDOR_CATEGORY_IN_USE`, `VENDOR_IN_USE`, `CUSTOMER_HOLD_REASON_REQUIRED`.
4. **Readable labels** for the Phase 7 lookups (customer type, status, hold reason, terms, ATL, WHT sections, address types, provinces).

## 7. Audit (row history)
- **Tables covered:** all 9 (6 triggers added here).
- **User attribution:** app changes run in the signed-in user's unit of work. Creating a vendor with its primary contact and bank account, and moving a primary flag, are one transaction each. Notes record their author from the session (never from input).
- **History view:** History tab on the customer and vendor detail pages; History in the group / category drawers.

## 8. Ordered tasks
1. **Roadmap:** Phase 7 `in-progress`; groups / categories template notes; opening balance → Phase 16, price list / tier → Phase 9 notes; `npm run delivery:roadmap` must pass.
2. **Database:** `013-parties.sql` (×2); Prisma models; `addUpdate` map; `isReferenced` tables; history registration.
3. **Contracts and domain.**
4. **Server:** `PartiesModule` (customers, groups, vendors, categories).
5. **Pages:** `/customers`, `/customers/[id]`, `/vendors`, `/vendors/[id]`, the two drawers; sidebar groups.
6. **Wire the flows;** then verification (§9) and the acceptance request.

## 9. Verification
- **API suite `api-p7`:**
  - **Groups / categories:** CRUD, duplicates → 409, delete in use → 409, deactivate.
  - **Customers:** auto `CUST-0001`; NTN / CNIC / STRN / guarantor CNIC formats → 400; credit limit < 0 → 400; receivable account not an asset account → 422; inactive group → 400; paging, search, filters; hold without a reason → 400; hold / release (`onHoldSince`); stale edit → 409; contacts (primary moves), addresses (default per type), notes (author from the session; someone else's note → 403); delete unused; reuse a deleted code → 409.
  - **Vendors:** auto `VEN-0001`; create with primary contact and bank (IBAN copied to the vendor); bad IBAN / SWIFT → 400; ADVANCE with credit days → 400; payable account not a liability → 422; second primary bank moves the flag; delete unused.
  - **Permissions** (default grants in `prisma/catalog.ts`):
    - salesman: customers view / create / edit (no delete), no vendors;
    - order booker: customers view only;
    - storekeeper: vendors view only, no customers;
    - financial accountant: both;
    - auditor: read-only.
  - **History:** real user and session on every write (psql).
- **Regression:** Phase 2–6 suites (shared nav, `isReferenced`).
- **Visual:** the four pages next to their templates; the drawers checked for consistency; 1400×900 and 390×844, light and dark.
- **Build:** typechecks, lint + lint:arch, roadmap check, SQL run twice.
- **Cleanup:** test data removed and purged.

## 10. Acceptance criteria, risks, blockers
- **Acceptance:** §9 passes; deviations are listed in the acceptance request.
- **Risks:**
  - The vendor row has its own `bankName` / `iban` besides `VendorBankAccounts`; the service keeps them equal to the primary bank account. Vendor `iban` only accepts Pakistani IBANs while bank accounts accept any country: a foreign primary account leaves the vendor row's IBAN empty.
  - Balances, overdue and statements stay empty until the invoice / bill phases; the pages show real zeros, not sample figures.
- **Blockers:** none.

---
**Approve Phase 7 revision 1 for implementation?**
