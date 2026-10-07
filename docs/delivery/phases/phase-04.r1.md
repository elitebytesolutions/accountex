# Phase 4 rev 1: Tax & treasury setup

**Objective:** give each company the tax and treasury masters that invoices, bills, payments and the cash/bank books will use:
- tax codes with dated rate history, mapped to GL accounts;
- banks and bank accounts, each tied to one postable GL account;
- cash accounts (drawers, counters, petty cash, imprest) and the categories cash entries are booked under;
- cheque books per bank account;
- expense categories for petty cash and expense claims.

Every change is attributed to the user in row history. Nothing posts yet (vouchers arrive in Phase 16): balances show 0 and opening balances stay locked, as in Phase 3.

**Entities (5, MASTER):** Tax Codes · Banks & Bank Accounts · Cash Accounts & Categories · Cheque Books · Expense Categories

**Status before this plan:** Phases 0–3 `done`; no phase in progress.

**Decisions taken with you:**
- **No setup template for four masters:** cash accounts, cash categories, cheque books and expense categories get **template-styled panels** built from existing template parts (page head, KPI cards, panels, tables, drawers, form grids). Cheque books live inside each bank account. Cash accounts, cash categories and expense categories get a small **Cash Setup** page now; the Cash Book and Expense Claims phases will open the same drawers from their own screens.
- **Tax codes: manual entry only.** No seeded set. The "import from Platform Tax Master" action moves to Phase 37 (Seed templates & tax master), where the master gets its data.
- **Banks: seed the common Pakistani banks** for every company (at provisioning, and for Demo now), plus an inline "Add bank" in the bank account form.
- **GL link: create or pick.** By default, adding a bank or cash account creates its postable GL account under Cash & bank (next free code, named after the account). Optionally, link an existing unused postable account.

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|
| Tax Codes | Master | Chart of accounts (done) | Sales/purchase lines, products and company settings reference tax codes |
| Banks & Bank Accounts | Master | Chart of accounts, currencies, branches (done) | Every bank voucher, cheque, receipt and payment needs a bank account |
| Cash Accounts & Categories | Master | Chart of accounts, branches, users (done) | Cash book, POS shifts and petty cash need them |
| Cheque Books | Master | Bank accounts (this phase) | Vendor payments by cheque draw leaves from a book |
| Expense Categories | Master | Chart of accounts (done) | Expense claims and petty cash vouchers post through them |

## 2. Verified schema (live DB; all 8 tables are empty)

**Tax Codes** (`Tax.TaxCodes`, `Tax.TaxCodeRates`; both audited)
- **TaxCodes:**
  - `code` `^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$`, max 20 chars, unique per company; `description`;
  - lookups: `taxType` (Sales tax / Withholding / Collection), `appliesTo` (6 values), `rateBasis` (Percent / Slab / None), `salesTaxKind` (Standard / Zero rated / Exempt / Reduced / Further);
  - `whtSection`, `whtNature`, `fbrReference`, `calcOnExclSalesTax`, `checkAtl`, `isSystem`, `isActive`, `deletedAt`;
  - `accountId` (tax account) and `inputAccountId` (input tax account) → chart of accounts.
- **Checks:**
  - sales tax ⇔ `salesTaxKind` set; other types need `whtSection`;
  - an account is required unless the basis is None; basis None only for Exempt.
- **TaxCodeRates:** `effectiveFrom`, `effectiveTo`, `rate` and `nonAtlRate` (0–100), `financeAct`, `remarks`. Periods may not overlap (`EXCLUDE` constraint). No `deletedAt`.
- **DB functions:**
  - `taxCodeAddUpdate`: rates as a child array, replaced by id;
  - `getTaxRateOnDate`: used from Phase 16.

**Banks & Bank Accounts** (`BankCash.Banks` not audited yet; `BankAccounts` audited)
- **Banks:**
  - `code` `^[A-Z][A-Z0-9_]{1,19}$`, unique per company; `name`, `shortName`;
  - `swiftBic` and `ibanBankCode` (4 letters), format-checked;
  - `isIslamic`, `isActive`, `deletedAt`.
- **BankAccounts:**
  - `bankId`, `branchId`; `accountType` (Current / Savings PLS / Running finance / Foreign currency);
  - `accountTitle`; `accountNo` (digits, spaces, dashes; unique per bank); `iban` `^PK[0-9]{2}[A-Z]{4}[0-9]{16}$`;
  - `accountId` (GL, unique per company); `currencyCode`;
  - `purpose` (Primary / Collections / Vendor payments / Payroll / Running finance / General), at most one Primary;
  - `creditLimit` (required for running finance); a foreign-currency account can't be PKR;
  - statement import options; `status` Active / Dormant / Closed (`closedOn` ⇔ Closed);
  - reconciliation and opening-balance columns, filled by later phases.

**Cash Accounts & Categories** (`CashAccounts` audited; `CashCategories` not audited yet)
- **CashAccounts:**
  - `code` `^[0-9]{4}(-[0-9]{2,3})?$`: the same shape as a GL code. I'll use the linked GL account's code.
  - `name`, `shortName`; `kind` (Drawer / Counter / Petty / Imprest), and petty/imprest need `imprestAmount`;
  - `branchId`, `custodianUserId`, `accountId` (GL, unique);
  - `varianceTolerance` (1,000), `approvalThreshold` (50,000), `isActive`, `deletedAt`.
- **CashCategories:**
  - `code` `^[A-Z][A-Z0-9_]{1,29}$`; `name`;
  - `direction` (In / Out / Transfer), `voucherType` (CRV/CPV/BRV/BPV/JV/Contra);
  - `defaultAccountId`, `partyKind` (None / Customer / Vendor / Employee / Bank);
  - `icon`, `colorToken`, `sortOrder`, `isSystem`, `isActive`, `deletedAt`.

**Cheque Books** (`BankCash.ChequeBooks`; audited)
- `bankAccountId`, `bookRef`, `firstLeafNo`, `lastLeafNo`, `nextLeafNo` (inside the range or one past it), `leafDigits` 4–10, `leaves`;
- `crossedAcPayee`, `receivedOn`, `status` (On order / Active / Exhausted / Cancelled), `remarks`;
- **one Active book per bank account**;
- the first leaf is unique per account, but **ranges may overlap** today. Phase SQL adds the no-overlap rule.
- No `deletedAt`.

**Expense Categories** (`BankCash.ExpenseCategories`; audited)
- `code` `^[A-Z][A-Z0-9_]{1,29}$`, `name`, `appliesTo` (Petty / Claim / Both), `accountId` (GL);
- `limitAmount` ⇔ `limitPeriod` (6 periods);
- `requiresPreApproval`, `receiptRequired`, `submitWithinDays`, `icon`, `sortOrder`, `isActive`, `deletedAt`.

**Across all 8 tables:**
- All have stamp/touch triggers and `*AddUpdate` functions. Lookup columns are validated by `validateLookups`.
- **No DB check that linked GL accounts are postable or active.** The services enforce it.
- **References that block deletion** (so these masters are deactivated rather than deleted once in use):
  - bank accounts: vouchers, cheques, receipts and payments;
  - tax codes: document lines, products and company settings;
  - cash accounts: cash book, POS shifts, petty cash.
- **Standard chart (Demo):**
  - group `1110 Cash & bank`: cash accounts `1110-01…03`, bank and clearing accounts `1110-10…22`;
  - tax accounts `1150-0x` (input) and `2130/2140-0x` (output, WHT);
  - mappings: `DEFAULT_BANK` → 1110-10, `CASH_IN_HAND` → 1110-01.

**Unresolved:** none blocking. Roadmap corrections:
- The cash-account rule "one per branch per currency" can't hold: cash accounts have no currency column. I'll replace it with "one cash account per GL account; the code is the GL code".
- The "import-master" action moves to Phase 37, as decided.

## 3. Template → page mapping
| Entity | Template | Page / component | Pattern | Notes |
|---|---|---|---|---|
| Tax Codes | `42-acc-reports.html` `app/tax/codes` | `/tax/codes` | page head, search + chips (All / Sales tax / Withholding / Inactive), table with active switch, row actions; `rpt-new-taxcode` modal for new/edit | Rate history: a "Rates" table in the modal (effective from/to, rate, non-ATL, Finance Act). It uses the template's table styles; the template has no rate list. "Check FBR rates" is omitted (no rate source). |
| Banks & Bank Accounts | `40-acc-core.html` `app/bank/accounts` | `/bank/accounts` | KPI grid, account cards, "All bank accounts" table, `acc-new-bank` modal | **Additions:** "Add bank" inline modal; "Banks" drawer to edit or deactivate banks; detail drawer per account (Details · Cheque books · History). Balances show 0 until Phase 16. |
| Cheque Books | none (the `app/bank/cheques` Issued tab lists issued cheques, not books) | "Cheque books" tab in the bank-account drawer | table + add/edit form in the drawer | Template-styled (decision). |
| Cash Accounts & Categories | none (Cash Book `app/cash/book` is a transaction screen) | `/cash/setup` "Cash Setup": Cash accounts panel (cards like the Cash Book account strip) and Cash categories table; drawers for create/edit | page head, KPI cards, panels, `Drawer` forms | Template-styled (decision). Moves behind a "Cash setup" button on the Cash Book in its phase. |
| Expense Categories | none (Expense Claims `app/cash/expenses` lists claims) | Expense categories panel on `/cash/setup` + drawer | table + drawer | Template-styled (decision). Opened from Expense Claims later. |

**Sidebar (Finance):**
- **Bank › Bank Accounts** (`bank:view`)
- **Cash › Cash Setup** (`cash:view`)
- **Tax & Compliance › Tax Codes** (`tax:view`)

These module names and icons match the template's nav. "Cash Setup" itself is new.

**Styles:**
- generic template classes only (`kpi-grid`, `card-grid`, `card`, `tbl`, `chips`, `toolbar`, `modal`, `drawer`, `form-grid`);
- `.card-grid`, `.spark` and any table extras are ported verbatim if they aren't already in `src/app/styles`.

**States everywhere:**
- loading, empty (with a "create the first …" action), field validation, success toast;
- error banner with reference;
- read-only without the edit permission, and a no-access page without view.

## 4. Clean Architecture
| Layer | Module / file | Responsibility |
|---|---|---|
| Contracts | `src/shared/treasury/{tax-code,bank,cash,cheque-book,expense-category}.ts` | Zod schemas mirroring the DB checks: code formats, IBAN, account number, rate 0–100, rate periods, leaf ranges, limit ⇔ period, type-specific required fields. PATCH schemas built with `patchFields` (no default leakage). |
| Domain | `src/server/modules/treasury/*/domain` | Pure rules: rate periods don't overlap, leaf range math (`leaves = last − first + 1`, next leaf), next GL code for a new bank or cash account. |
| Application | `TaxCodesService`, `BanksService`, `BankAccountsService`, `ChequeBooksService`, `CashAccountsService`, `CashCategoriesService`, `ExpenseCategoriesService` + abstract stores | Validation against live data: GL account postable / active / right class, one link per GL account, branch and custodian active. Create-or-link GL account in the same unit of work. In-use checks before delete; `rowVersion`. |
| Infrastructure | Prisma stores using the DB `*AddUpdate` functions via `addUpdate` (schema map gains `Tax`, `BankCash`) | Persistence. Soft delete via `deletedAt` where the column exists; hard delete for cheque books (unused) and rate rows. |
| Server adapter | Controllers under `/api/tax/codes`, `/api/bank/{banks,accounts,cheque-books}`, `/api/cash/{accounts,categories,expense-categories}` | `@RequirePermission`, Zod pipes, `UnitOfWork` with the signed-in user. |
| UI | `src/features/treasury/{api.ts, components/*}`; pages `/tax/codes`, `/bank/accounts`, `/cash/setup` | Template-faithful screens; drawers reused later by Cash Book and Expense Claims. |

## 5. API contracts (all under `/api`, tenant from the session)
| Method & path | Request → Response | Permission | Errors |
|---|---|---|---|
| `GET /tax/codes?search&type&status` | → `TaxCode[]` with current rate and rates | `tax:view` | |
| `POST /tax/codes` | code, description, type, appliesTo, basis, kind/section, accounts, flags, `rates[]` → `TaxCode` | `tax:create` | 400 fields; 409 duplicate code; 422 `ACCOUNT_NOT_POSTABLE`; 422 `TAX_RATE_OVERLAP` |
| `PATCH /tax/codes/:id` | partial + `rates[]` (replace by id) + rowVersion | `tax:edit` | 409 stale; as above |
| `POST /tax/codes/:id/activate`, `/deactivate` | rowVersion | `tax:edit` | |
| `DELETE /tax/codes/:id?rowVersion` | soft delete when unreferenced | `tax:edit` (resource has no delete action) | 409 `TAX_CODE_IN_USE` |
| `GET/POST/PATCH /bank/banks`, `POST …/:id/activate`, `/deactivate`, `DELETE …/:id` | bank fields | view `bank:view`; changes `bank:create` / `bank:edit` / `bank:delete` | 409 `BANK_IN_USE`, 400 SWIFT / IBAN code |
| `GET /bank/accounts?search&status` | → `BankAccount[]` (bank, branch, GL code, balance 0, cheque book summary) | `bank:view` | |
| `POST /bank/accounts` | bank, branch, type, title, number, IBAN, bank branch, currency, purpose, limit, flags, `gl: { mode: 'create', parentId? } \| { mode: 'link', accountId }` → `BankAccount` | `bank:create` | 400 IBAN / number; 409 duplicate number; 409 `PRIMARY_BANK_EXISTS`; 422 `ACCOUNT_NOT_POSTABLE`, `GL_ACCOUNT_LINKED` |
| `PATCH /bank/accounts/:id` | partial + rowVersion (GL link is fixed) | `bank:edit` | 409 stale |
| `POST /bank/accounts/:id/{dormant,activate,close}` | rowVersion (+ closedOn) | `bank:edit` | 409 `BANK_ACCOUNT_HAS_ACTIVE_BOOK` when closing |
| `DELETE /bank/accounts/:id?rowVersion` | soft delete when unreferenced (its unused GL account stays) | `bank:delete` | 409 `BANK_ACCOUNT_IN_USE` |
| `GET /bank/cheque-books?bankAccountId` · `POST` · `PATCH /:id` · `POST /:id/{activate,cancel}` · `DELETE /:id` | book ref, first / last leaf, digits, received on, crossed, remarks | `bank:*` | 422 `CHEQUE_BOOK_OVERLAP`; 409 one active book; 409 `CHEQUE_BOOK_IN_USE` |
| `GET /cash/accounts` · `POST` · `PATCH /:id` · `POST /:id/{activate,deactivate}` · `DELETE /:id` | name, kind, branch, custodian, imprest, tolerance, threshold, `gl` (create / link) | `cash:*` | 422 imprest required; 422 `ACCOUNT_NOT_POSTABLE`, `GL_ACCOUNT_LINKED`; 409 `CASH_ACCOUNT_IN_USE` |
| `GET/POST/PATCH/DELETE /cash/categories`, `POST /:id/{activate,deactivate}` | code, name, direction, voucher type, default account, party kind, icon, colour, order | `cash:*` | 409 duplicate; 409 `CASH_CATEGORY_IN_USE`; system rows can't be deleted |
| `GET/POST/PATCH/DELETE /cash/expense-categories`, `POST /:id/{activate,deactivate}` | code, name, appliesTo, expense account (class 5), limit + period, flags, submit within | `cash:*` | 422 `ACCOUNT_NOT_POSTABLE`; 409 `EXPENSE_CATEGORY_IN_USE` |

- **Delete vs deactivate:**
  - delete is allowed only while nothing references the row (soft where `deletedAt` exists);
  - otherwise the row is deactivated: tax codes, banks, categories, cash accounts via active/inactive; bank accounts Dormant / Closed; cheque books Cancelled.
  - Codes stay unique after deletion and are never reused (`CODE_RETIRED`, as in Phase 3).
- **Concurrency:** `rowVersion` on every update and action (409 `CONCURRENCY_CONFLICT`).
- **Lists:** all of these are small (tens of rows). Each loads whole and is filtered client-side like the templates, so no server paging is needed.

## 6. Database changes: `prisma/sql/010-tax-treasury.sql` (idempotent, added to `db:sql`)
1. **Audit triggers:** `triggerAudit` on `BankCash.Banks` and `BankCash.CashCategories`.
2. **Cheque leaf ranges:** `EXCLUDE` constraint `chequeBookNoOverlap` (int8range of first–last leaf per bank account; cancelled books excluded).
3. **Error codes:**
   - `TAX_RATE_OVERLAP`, `CHEQUE_BOOK_OVERLAP`, `PRIMARY_BANK_EXISTS`, `GL_ACCOUNT_LINKED`, `BANK_ACCOUNT_HAS_ACTIVE_BOOK`;
   - `TAX_CODE_IN_USE`, `BANK_IN_USE`, `BANK_ACCOUNT_IN_USE`, `CHEQUE_BOOK_IN_USE`, `CASH_ACCOUNT_IN_USE`, `CASH_CATEGORY_IN_USE`, `EXPENSE_CATEGORY_IN_USE`.
   - Overlap errors are checked in the services with their own codes. The constraints stay as the safety net (SQLSTATE 23P01 already maps to a generic overlap message).
4. **Pakistani banks:**
   - `BankCash.seedBanksFor(pTenant)` holds the list itself (no new table): about 25 banks (code, name, short name, SWIFT, IBAN bank code, Islamic), e.g. HBL, MCB, UBL, ABL, NBP, Meezan, Bank Alfalah, Faysal, BAHL, Askari, JS, Soneri, Standard Chartered, Habib Metro, Dubai Islamic, BankIslami, Al Baraka, Silkbank, Summit, SBP.
   - It inserts the missing ones for a company (by code), so re-running is safe.
   - An `AFTER INSERT` trigger on `Platform.Tenants` (like the fiscal-year hook) runs it at provisioning.
   - Demo is backfilled.
   - Seeding is labelled `system: 010-tax-treasury.sql`.
5. **Readable labels** for the Phase 4 lookups (e.g. "Savings / PLS", "Contra").

## 7. Audit (row history)
- **Tables covered:** all 8 tables (2 get their trigger in this phase).
- **User attribution:**
  - App changes run in the signed-in user's unit of work, with session and correlation id.
  - Creating a bank or cash account with a new GL account is **one transaction**: the GL account, the bank/cash account and any cheque book are all attributed to the same user and request.
- **History view:** History in each drawer or modal (tax code, bank, bank account, cheque book, cash account, cash category, expense category). Tables are registered in `history-tables.ts` with `tax:view`, `bank:view`, `cash:view`.

## 8. Ordered tasks
1. **Roadmap:**
   - set Phase 4 `in-progress`;
   - tax codes: drop "import-master" (→ Phase 37), rates edited as a dated list;
   - cash accounts: rule corrected;
   - cheque books, cash categories, expense categories: `tpl` cleared with an open note "template-styled panel, decided 2026-10-05";
   - banks: seed + inline add noted;
   - `npm run delivery:roadmap` must pass.
2. **Database:** `010-tax-treasury.sql`, applied twice; map the 8 models into Prisma; extend the `addUpdate` schema map.
3. **Contracts and domain rules.**
4. **Server:** services, stores, controllers, history registration.
5. **Pages:**
   - `/tax/codes` and `/bank/accounts` from the templates;
   - the bank account drawer with cheque books;
   - `/cash/setup` panels and drawers;
   - sidebar entries.
6. **Wire to the API:** every create / edit / activate / deactivate / delete flow, GL create-or-link, inline bank add.
7. **Verification** (§9), then the acceptance request.

## 9. Verification
**Functional (API suite `api-p4`, plus UI flows)**
- **Tax codes:**
  - create GST-18 (sales tax, standard, output and input accounts) with a dated rate, and WHT-153A (withholding, section, non-ATL rate);
  - missing section / kind → 400; non-postable account → 422; overlapping rates → 422;
  - add a new rate from next year → history shows both;
  - deactivate and activate; delete an unused code.
- **Banks and accounts:**
  - Demo has the seeded banks; add a bank inline;
  - create a bank account with a new GL account → GL `1110-23` appears in the chart of accounts, both attributed to the user;
  - link an existing unused GL account; linking an already-linked one → 422;
  - bad IBAN → 400; second Primary → 409; running finance without a limit → 400;
  - mark Dormant; close; delete an unused account.
- **Cheque books:**
  - add a book (leaves computed); an overlapping range → 422; a second active book → 409;
  - cancel; delete an unused book.
- **Cash:**
  - create a drawer with a new GL account and a petty fund (imprest required → 400 without it);
  - custodian must be an active user;
  - categories (In / Out, default account) CRUD; system rows protected.
- **Expense categories:** expense account must be class 5 postable; limit without a period → 400; CRUD.
- **Permissions:**
  - Auditor views only; Cashier can create/edit cash but not bank or tax; Salesman has no access;
  - delete without `*:delete` → 403.
- **History:** every insert / update / delete shows the real user and session (psql check); seeding rows show `system: …`.

**Regression:** the Phase 1–3 API suites re-run.

**Visual:**
- headless Edge screenshots of `/tax/codes` (list, modal) and `/bank/accounts` (cards, table, add modal, drawer), next to the template routes;
- `/cash/setup` (no template, so checked for consistency with the template's components);
- 1400×900 and 390×844, light and dark.

**Build:** both typechecks, lint + lint:arch, roadmap check, SQL run twice.

## 10. Acceptance criteria, risks, blockers
- **Acceptance:** all of §9 passes, and the deviations are listed in the acceptance request.
- **Risks:**
  - The four template-less panels are new design compositions. They reuse template components but can't be compared pixel-for-pixel.
  - The seeded bank list (SWIFT and IBAN codes) is reference data I compile. Please spot-check it during acceptance.
  - Balances, reconciliation, statement import and cheque issuing stay empty until the treasury transaction phases.
- **Blockers:** none.

---
**Approve Phase 4 revision 1 for implementation?**
