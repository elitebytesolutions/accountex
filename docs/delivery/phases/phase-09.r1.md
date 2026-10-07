# Phase 9 rev 1: Pricing & collections setup

**Objective:** the pricing and collection rules that the sales and receivables documents (Phases 19–23) will read:
- price lists with per-product prices (effective-dated) and quantity-break slabs;
- trade schemes (free goods, invoice / line discounts, bundle prices, settlement discounts, service schemes) with their products and eligible customers;
- the three wholesale price tiers (rate factors);
- payment-reminder message templates (English + Urdu) and the reminder schedule.

Every change is attributed to the user in row history. Nothing is priced, discounted or sent yet: applying prices and schemes and sending reminders arrive with the documents that use them.

**Entities (4, MASTER):** Price Lists · Sales Schemes · Payment Reminder Setup · Price Tiers

**Status before this plan:** Phases 0–8 `done`; no phase in progress.

**Decisions taken with you:**
- **Price changes are for approvers.** Viewing price lists, quantity breaks and schemes needs `quo:view`. Creating and editing them needs `quo:approve` (Admin and Financial Accountant by default), not `quo:create`/`quo:edit`, so salesmen can't change prices. Deleting needs `quo:delete` (Admin).
- **Price tiers get a 4th tab on the Price Lists page.** It is styled like the other tabs. The three tiers are seeded per company: Retailer 1.00, Wholesaler 0.95, Distributor 0.90 (the template's values). The tier codes are a fixed lookup (`PriceTierCode`), so tiers are edited (name, rate factor, rank, active), not added or deleted.
- **Reminders start with the template's standard set.** Each company is seeded with 4 message templates (Gentle heads-up, Due today, Firm follow-up, Final notice + hold; English + Urdu) and 4 rules (3 days before due, on the due date, 7 and 15 days after due). Templates are edited in a drawer opened from the reminders page.
- **Price lists are assigned through customer groups and customers.** A "Price list" select is added to the Phase 7 customer group drawer and customer form. Price list rows then show their groups and customer counts, as in the template.

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|
| Price Lists | Master | Products (8, done), customer groups and customers (7, done), currencies (1, done) | Quotations, orders and invoices take their prices from the customer's list |
| Sales Schemes | Master | Products (8), customer groups and customers (7) | Invoices apply schemes; they must exist before Phase 21 |
| Payment Reminder Setup | Master | Users (2, done) | The receivables phase sends reminders on this schedule |
| Price Tiers | Master | none | Wholesale order booking and route shops price by tier |

## 2. Verified schema (live DB; all nine tables are empty)

**Price Lists** (`Sales.PriceLists`, audited)
- **Header:**
  - `code` `^[A-Z0-9][A-Z0-9-]{1,19}$`, unique;
  - `name`, `markupPct` ≥ 0, `roundingTo` > 0 (default 1);
  - `isDefault` (only one live default per company: partial unique index);
  - `currencyCode` → `Company.Currencies` (default PKR);
  - `validFrom` ≤ `validTo` (both optional), `status` (lookup `ActiveInactiveStatus`), `remarks`, `deletedAt`.
- **Items** (`PriceListItems`, audited): product, `price` ≥ 0, `effectiveFrom` (default today). Unique per list + product + effective date, so a price change is a new dated row and older prices stay.
- **Quantity breaks** (`PriceListQuantityBreaks`, audited): `priceListId` (nullable: a null list means the slab applies to every list), product, `tierNo` 1–20 (unique per list + product), `minQty` > 0, `maxQty` ≥ `minQty` or null ("and above"), `unitPrice` ≥ 0.
- **Referenced by:** customer groups and customers (`priceListId`), and quotations, sales orders and invoices (later phases). A referenced list can't be deleted, only deactivated.
- **DB function:** `Sales.priceListAddUpdate` saves the header with items and quantity breaks as arrays.

**Sales Schemes** (`Sales.SalesSchemes`, audited)
- **Header:**
  - `code` `^SC-\d{3,6}$`, unique, auto-numbered SC-001…;
  - `name`, `description`, `schemeType` (lookup `SchemeType`), `validFrom` ≤ `validTo` (both required), `isActive`;
  - `appliesToAll`, `budgetCap` > 0, `maxUsesPerCustomer` > 0;
  - `usedCount` and `valueGiven` are filled by invoices later; `valueGiven` ≤ `budgetCap`; `deletedAt`.
- **Fields each type needs** (DB check `schemeTypeFieldsChk`):

  | Type | Required fields |
  |---|---|
  | FREE_GOODS | `buyQty` + `freeQty` |
  | INVOICE_DISCOUNT | `minInvoiceAmount` + exactly one of `discountPct` / `discountAmount` |
  | BUNDLE_PRICE | `bundlePrice` |
  | LINE_DISCOUNT | exactly one of `discountPct` / `discountAmount` (optional `minLineQty`) |
  | SETTLEMENT | `settlementDays` + `discountPct` |
  | SERVICE | none |

- **Items** (`SalesSchemeItems`): product, `itemRole` (lookup `ItemRole`: BUY / FREE / BUNDLE / DISCOUNTED), `qty` > 0; unique per scheme + product + role. **Audit trigger missing → added.**
- **Eligibilities** (`SalesSchemeEligibilities`): exactly one of customer group / customer / price tier (lookup `PriceTier`), plus `isExcluded`; unique per scheme. **Audit trigger missing → added.**
- **Referenced by:** invoices, invoice lines and held bills (later phases).
- **DB function:** `Sales.salesSchemeAddUpdate` saves the header with items and eligibility as arrays.

**Payment Reminder Setup**
- **Templates** (`Sales.PaymentReminderTemplates`):
  - `code` `^[A-Z][A-Z0-9_]{1,29}$`, unique;
  - `name`, `emailSubject`, `bodyEn` (required), `bodyUr`, `isActive`, `deletedAt`.
  - Placeholders `{customer}`, `{invoice}`, `{amount}`, `{due_date}`.
  - **Audit trigger missing → added.**
- **Rules** (`Sales.PaymentReminderRules`):
  - `name`, `offsetDays` −60…365 (unique per company), `dunningLevel` (lookup `DunningLevel`);
  - channels `sendWhatsapp` / `sendSms` / `sendEmail` (at least one unless the action isn't MESSAGE), `templateId`;
  - `action` (lookup: MESSAGE / CALL_TASK / CREDIT_HOLD / LEGAL_NOTICE), `attachStatement`;
  - `escalate` → `escalateToUserId` (required when escalating), `applyCreditHold`, `runTime` (default 09:00), `isActive`;
  - `sentCount` is filled by the sender later.
  - No `deletedAt`, so rules are hard-deleted when unreferenced.
  - **Audit trigger missing → added.**
- **Referenced by:** reminder logs and credit-hold events (later phases).
- **DB functions:** `paymentReminderTemplateAddUpdate`, `paymentReminderRuleAddUpdate`.

**Price Tiers** (`Distribution.PriceTiers`, audited)
- `code` (lookup `PriceTierCode`: RETAILER / WHOLESALER / DISTRIBUTOR), unique; `name`, `rateFactor` 0 < x ≤ 2, `allocationRank` ≥ 0, `isActive`, `deletedAt`.
- Referenced by route shop profiles, held bills and order bookings (later phases).
- DB function `Distribution.priceTierAddUpdate`.

**Customer assignment (Phase 7 tables, existing columns):** `Sales.CustomerGroups.priceListId` and `Sales.Customers.priceListId`. The customer's own list wins over the group's, which wins over the company default. (`Customers.priceTier` / `priceTierFactor` stay for the wholesale phases.)

**Unresolved questions:** none. The roadmap's open questions are answered:
- schemes are the template's "Schemes" tab on Price Lists;
- tiers get a 4th tab there.

## 3. Template → page mapping
All pages come from `template/src/4A-company-plus.html` + `9A-company-plus.js`, with styles from `1A-company-plus.css`. The `cp-pl`, `cp-sch`, `cp-qb`, `cp-rule`, `cp-rm` and `cp-phone` sections are only partly ported, so they're ported in full.

| Entity | Template · route / tab | Page / component | Pattern | Notes |
|---|---|---|---|---|
| Price Lists | `app/sales/price-lists` tab **Price lists** | `/sales/price-lists` → `PriceListsScreen` | Split: list of price lists (left) + price grid editor (right); drawer to create / edit a list | **From the template:** the list rows (colour dot, Default badge, code, groups, customer count, markup, average-margin badge), the margin legend, the grid with Item / Cost / Retail / List price / Margin / vs Retail, inline price edits with live margin, category chips (the product class), "Markup on cost" + "Apply to all" (rounded to the list's `roundingTo`), Save (changed prices only), Export (CSV of all lists). **Added:** a drawer for the list header (code, name, markup, rounding, currency, valid dates, default, status), Copy list, Delete, an effective-date field on Save (default today), and a History tab in the drawer. The template's "+" toast is replaced by the real create drawer. The grid is server-paged per list. |
| Quantity breaks | tab **Quantity breaks** | same page | Builder panel + chart + "Try it" calculator | **From the template:** product select, tiers table (T1…, min / max / unit price, off-base %, margin), Add tier, remove, Save slabs, the step chart with the cost line, the quantity slider and its result. **Added:** a list select (a specific list or "All lists"). |
| Sales Schemes | tab **Schemes** | same page | Scheme cards + filter + drawer | **From the template:** the strip (live count; the "discount given" and "sales uplift" pills read 0 until invoices exist), the All / Live / Off filter, cards with an icon and tone by type, Live / Scheduled / Ended / Off status from the dates and active flag, the active switch, dates, who's eligible, times applied, discount given, budget used. **"New scheme"** opens the template's drawer: type cards (all six types), name, the type's fields, products (buy / free / bundle / discounted), eligible groups / customers / tiers, dates, budget cap, max uses per customer. Edit and History in the same drawer. |
| Price Tiers | **added tab** "Price tiers" | same page | Small table with inline edit | Tier, name, rate factor (shown as % of wholesale price), rank, active, last changed; edit in a modal; History. Styled with the page's panel and table classes. |
| Payment Reminder Setup | `app/receivables/reminders` | `/receivables/reminders` → `RemindersScreen` | Schedule panel + live phone preview + panels | **From the template:** the "Reminder schedule" panel (rule cards: offset chip, label, channel toggles, template select, active switch, escalation line), "Add rule", the quiet-hours note, the **live preview** (English / اردو, WhatsApp / SMS / Email phone mock-ups, placeholder chips filled from a real customer with sample invoice values). **Added:** a templates drawer (list + editor with placeholder buttons, English and Urdu bodies, email subject, SMS segment count) and a rule drawer for the fields the cards don't show (offset, dunning level, action, attach statement, escalate to user, credit hold, run time). **Placeholders until receivables / invoices exist:** the four KPIs, "Overdue customers" and "Sent log" panels (empty states), and "Send due reminders" / "Send now" (disabled). |
| Customer assignment | Phase 7 customer group drawer and customer form | existing components | Select | "Price list" select (active lists, "Company default"). |

Every page has loading (skeleton), empty, validation (field errors), success (toast), error (catalogue message + reference) and permission states (buttons hidden or disabled without the permission).

Missing templates: none. The price-tiers tab, the templates drawer and the rule drawer are additions styled from the page's existing classes.

## 4. Clean Architecture
| Layer | Module / file | Responsibility |
|---|---|---|
| Contracts | `src/shared/sales/{price-list,scheme,price-tier,reminder}.ts` | Zod schemas: list / detail / create / update, query; helpers `marginPct`, `roundTo`, `breakPrice(slabs, qty)`, `schemeStatus(dates, active, today)`, `fillPlaceholders(body, values)`, `smsSegments(text)` |
| Domain | `src/server/modules/sales-setup/*/domain` | Rules: slab ranges ascend without gaps or overlaps; scheme fields match its type; the resolve order (customer → group → default list; latest `effectiveFrom` ≤ date; then quantity break); next SC-/code numbers |
| Application | `PriceListsService`, `SchemesService`, `PriceTiersService` (module `sales-setup`); `RemindersService` (module `receivables`) | Use cases in `UnitOfWork.run(actorContext…)`; reference checks before delete; default-list switch |
| Infrastructure | Prisma stores; writes through the `*AddUpdate` functions (allow-list in `add-update.ts`); `references.ts` entries for in-use checks | Read models with counts (groups, customers, items, margins) |
| Server adapter | Controllers `/api/sales/price-lists`, `/api/sales/quantity-breaks`, `/api/sales/schemes`, `/api/distribution/price-tiers`, `/api/receivables/reminder-templates`, `/api/receivables/reminder-rules` | Zod pipes, `@RequirePermission`, user context for audit |
| UI | `src/features/sales-setup/*`, `src/features/receivables/*`; pages `src/app/(app)/sales/price-lists`, `src/app/(app)/receivables/reminders`; Phase 7 group drawer / customer form get the select | Screens from the templates; nav entries Sales › "Price Lists & Schemes", Receivables › "Payment Reminders" |

## 5. API / action contracts
| Method & path | Request | Response | Permission | Errors |
|---|---|---|---|---|
| `GET /api/sales/price-lists` | search, status, page, pageSize, sort | `{ items, total }` with group / customer counts, item count, average margin | `quo:view` | — |
| `GET /api/sales/price-lists/:id` | — | header + groups | `quo:view` | 404 |
| `GET /api/sales/price-lists/:id/items` | search, class, page, pageSize, date | products with cost, retail, current list price (latest effective ≤ date), margin | `quo:view` | — |
| `POST /api/sales/price-lists` | header (+ optional `copyFromId`, markup → prices) | detail | `quo:approve` | 409 code, 409 `DB_UNIQUE_VIOLATION` for a second default |
| `PATCH /api/sales/price-lists/:id` | header fields + rowVersion | detail | `quo:approve` | 409 stale |
| `POST /api/sales/price-lists/:id/items/bulk` | `{ effectiveFrom, items: [{ itemId, price }] }` or `{ effectiveFrom, markupPct }` | `{ saved }` | `quo:approve` | 400 negative price; below-cost prices are flagged red, not blocked (see §10) |
| `POST /api/sales/price-lists/:id/copy` | `{ code, name }` | detail | `quo:approve` | 409 code |
| `POST /api/sales/price-lists/:id/activate \| deactivate` | rowVersion | detail | `quo:approve` | 409 stale |
| `DELETE /api/sales/price-lists/:id` | rowVersion | 204 | `quo:delete` | 409 `PRICE_LIST_IN_USE` (groups, customers, documents) |
| `GET /api/sales/price-lists/resolve` | customer, product, qty, date | `{ priceListId, price, source: LIST \| BREAK \| PRODUCT }` | `quo:view` | — |
| `GET /api/sales/quantity-breaks` | priceList (or none), product | slabs | `quo:view` | — |
| `PUT /api/sales/quantity-breaks` | `{ priceListId \| null, itemId, slabs: [{ minQty, maxQty, unitPrice }] }` (replaces that product's slabs) | slabs | `quo:approve` | 400 `QTY_BREAK_RANGES` (gaps, overlaps, not ascending) |
| `GET /api/sales/schemes` | search, status (live / scheduled / ended / off), type, page, pageSize | `{ items, total }` + strip totals | `quo:view` | — |
| `GET /api/sales/schemes/:id` | — | header + items + eligibility | `quo:view` | 404 |
| `POST / PATCH /api/sales/schemes(/:id)` | header + items + eligibility (+ rowVersion) | detail | `quo:approve` | 400 type fields (`SCHEME_FIELDS`), 400 dates, 409 stale |
| `POST /api/sales/schemes/:id/activate \| deactivate` | rowVersion | detail | `quo:approve` | 409 stale |
| `DELETE /api/sales/schemes/:id` | rowVersion | 204 | `quo:delete` | 409 `SCHEME_IN_USE` (used on documents, or `usedCount` > 0) |
| `GET /api/distribution/price-tiers` | — | 3 tiers | `pricetier:view` or `quo:view` | — |
| `PATCH /api/distribution/price-tiers/:id` | name, rateFactor, allocationRank, isActive, rowVersion | tier | `pricetier:edit` | 400 factor, 409 stale |
| `GET /api/receivables/reminder-templates` · `POST` · `PATCH /:id` · `DELETE /:id` | code, name, emailSubject, bodyEn, bodyUr, isActive | template(s) | view `rcpt:view`; write `rcpt:edit`; delete `rcpt:delete` | 409 code, 409 `REMINDER_TEMPLATE_IN_USE` (rules or logs) |
| `POST /api/receivables/reminder-templates/:id/preview` | `{ customerId?, language, channel }` | `{ text, subject, segments }` (sample invoice values when there's no invoice yet) | `rcpt:view` | 404 |
| `GET /api/receivables/reminder-rules` · `POST` · `PATCH /:id` · `POST /:id/activate \| deactivate` · `DELETE /:id` | rule fields | rule(s) with template name and escalation user | view `rcpt:view`; write `rcpt:edit`; delete `rcpt:delete` | 409 same offset (`DB_UNIQUE_VIOLATION`), 400 no channel / escalation user missing, 409 `REMINDER_RULE_IN_USE` (logs) |
| `GET /api/history/Sales/<table>/:id`, `/Distribution/PriceTiers/:id` | — | row history | the entity's view permission | — |

- **Delete vs deactivate:**
  - **Price lists and schemes:** deleted only when unreferenced (soft delete, code retired); otherwise deactivated.
  - **Tiers:** never deleted.
  - **Templates:** soft delete when unreferenced.
  - **Rules:** hard delete when there are no logs, otherwise deactivated.
- **Concurrency:** every write carries `rowVersion`; stale → 409.
- **Paging / filters / sort:**
  - price lists and schemes are server-paged with search and status filters;
  - the price grid is server-paged with search and class filters;
  - tiers, templates and rules are short lists, not paged.

## 6. Database changes: `prisma/sql/015-pricing.sql` (idempotent, added to `npm run db:sql`)
- Audit triggers on `SalesSchemeItems`, `SalesSchemeEligibilities`, `PaymentReminderTemplates`, `PaymentReminderRules`.
- **Per-tenant seed** (function + tenant-insert trigger, as Phase 6/8 did; also run for existing tenants), so every company has:
  - the three price tiers;
  - the four reminder templates;
  - the four reminder rules.
- **Error codes:** `PRICE_LIST_IN_USE`, `SCHEME_IN_USE`, `SCHEME_FIELDS`, `QTY_BREAK_RANGES`, `REMINDER_TEMPLATE_IN_USE`, `REMINDER_RULE_IN_USE`.
- **Lookup labels and tones** for `SchemeType`, `ItemRole`, `DunningLevel`, `PaymentReminderRuleAction`, `PriceTier` (codes unchanged).
- **No new tables or columns.** The Prisma models are mapped from a scratch `db pull`.

## 7. Audit (row history)
- **Tables covered:** all nine. Five already have the trigger and four get it in `015`.
- **User attribution:**
  - every write runs in `UnitOfWork.run(actorContext(user, meta))`, so the audit row records the signed-in user (ID and name/email snapshot), IP, user agent, session and correlation ID;
  - the seed runs as `system: seedPricingDefaultsFor`.
- **History view:**
  - History tab in the price list drawer, the scheme drawer, the tier modal, the template drawer and the rule drawer;
  - list-price edits show in the price list's items history (per product row).

## 8. Ordered tasks
1. `015-pricing.sql` (triggers, seeds, error codes, labels); Prisma models; register tables in `references.ts`, `add-update.ts` and `history-tables.ts`.
2. Shared contracts and helpers.
3. Server module `sales-setup`: price lists (items grid, bulk, copy, resolve), quantity breaks, schemes, price tiers.
4. Server module `receivables`: reminder templates and rules, preview.
5. Pages from the templates, with their CSS ported in full; nav entries.
6. Wire the pages to the API; Phase 7 group drawer / customer form get the price-list select.
7. Delete / deactivate rules, error states, permission states.
8. Verification: API suite, regressions P2–P8, visuals, history attribution; clean the test data.

## 9. Verification
- **Functional** (API suite `api-p9`), for each entity:
  - create / read / update / delete or deactivate, persisted after reload;
  - validation:
    - scheme fields per type and date windows;
    - slab ranges;
    - offsets −60…365, unique per company;
    - at least one channel; escalation needs a user;
    - tier factor 0–2;
  - effective dates: a future price doesn't change today's resolved price;
  - resolve order: customer list → group list → default list → product price, then quantity break;
  - in-use blocks: a list assigned to a group; a template used by a rule;
  - default switch: only one default list;
  - permissions:
    - salesman: views, but price-list/scheme writes → 403;
    - financial accountant: writes allowed; delete → 403;
    - auditor: read-only;
    - cashier: no tier access;
  - history rows carry the real user.
- **Visual:** each tab and the reminders page vs the template, in light and dark at 1400 px and on 390 px mobile; the phone mock-up in all three channels and both languages.
- Regression suites P2–P8 still pass. Typecheck, lint, architecture and roadmap checks pass.

## 10. Acceptance criteria, risks, blockers
- **Acceptance:**
  - everything in §9 passes;
  - test data cleaned (seeded tiers, templates and rules kept);
  - deviations listed honestly.
- **Risks:**
  - **Price grid size:** the grid lists every product per list. It's server-paged, so large catalogues are fine, but "Apply to all" is a single bulk write.
  - **List prices below cost are warned, not blocked.** This is my proposal: the template colours them red and doesn't stop them. Say if you'd rather block them.
  - **Customer price tier stays hidden.** `Customers.priceTier` / `priceTierFactor` are left for the wholesale phases.
- **Blockers:** none.

---
**Approve Phase 9 revision 1 for implementation?**
