# Phase 5 rev 1: Treasury rules & compliance setup

**Objective:** finish the treasury and compliance masters the transaction phases rely on:
- bank rules that categorise statement lines;
- petty cash funds (imprest, custodian, low/critical thresholds);
- fixed asset categories with depreciation defaults and GL accounts;
- FBR / PRA integration settings with an encrypted API token and branch POS mappings;
- segregation-of-duties rules moved from code into the database.

Every change is attributed to the user in row history. Nothing posts yet.

**Entities (5, MASTER):** Bank Rules · Petty Cash Funds · Fixed Asset Categories · FBR Settings · Segregation-of-Duties Rules

**Status before this plan:** Phases 0–4 `done`; no phase in progress.

**Decisions taken with you:**
- **Petty cash fund drives its cash account.** Creating a fund creates its petty cash account and GL account in one step, or picks an existing petty/imprest account that has no fund. The fund's imprest and custodian are the source and are copied onto the cash account in the same save.
- **FBR / PRA token in an encrypted secrets table.**
  - New `Company.TenantSecrets`; AES-256-GCM with an app key in `.env` (`APP_ENCRYPTION_KEY`).
  - `FbrSettings` keeps only the reference and a 4-character hint. The token is never returned, and row history redacts it.
- **"Test connection" deferred** to Phase 28 (Tax compliance, FBR submissions). The connection status stays "Not configured", or "Configured" once a token is saved.
- **SoD rules seeded as warnings.** Every company gets the 16 rules that exist in code today, all "Warn", so behaviour is unchanged. Admins can add custom pairs and set rules to "Block"; a role that breaks a Block rule can't be saved.
- **Missing setup templates** (as in Phase 4): template-styled panels for the petty cash fund form, asset categories and SoD rule management.

## 1. Selection rationale
| Entity | Kind | Depends on (status) | Why now |
|---|---|---|---|
| Bank Rules | Master | Bank accounts (done), chart of accounts (done), cost centres (done) | Statement import and reconciliation (Phase 17+) apply them |
| Petty Cash Funds | Master | Cash accounts (done), users (done) | Petty cash vouchers and replenishments post against a fund |
| Fixed Asset Categories | Master | Chart of accounts (done) | The asset register and depreciation (Phase 27) need them |
| FBR Settings | Master | Branches (done), company NTN/STRN (done) | Sales invoices report to FBR once enabled (Phase 23, Phase 28) |
| SoD Rules | Master | Roles & permissions (done) | Moved from Phase 3; Roles & Permissions reads conflicts from them |

## 2. Verified schema (live DB; all 7 tables are empty)

**Bank Rules** (`BankCash.BankRules` + `BankRuleConditions`; audited)
- `code` `^BR-[0-9]{2,4}$` (unique), `name`, `priority` (100), `matchMode` ALL/ANY;
- `bankAccountId` (optional: one account or all), `accountId` (GL, required), `costCentreId`;
- `autoPost`, `isEnabled`, `hitCount`, `lastHitAt`, `deletedAt`.
- **Conditions:** `seq`, `field` (DESC / AMT / REF / TYPE), `operator` (CONTAINS / STARTS_WITH / EQUALS / LT / GT / IS), `value`.
  - AMT values are numbers; TYPE values are IN/OUT.
- Referenced by statement lines and bank transactions, so a used rule is disabled, not deleted.
- DB function `bankRuleAddUpdate` (conditions as a child array).

**Petty Cash Funds** (`BankCash.PettyCashFunds`; audited)
- `name`, `branchId`, `cashAccountId` (unique: one fund per cash account), `custodianUserId` (`custodianEmployeeId` stays unused until HR);
- `imprestAmount` > 0; `lowPct` / `criticalPct` (0–100, critical < low, defaults 25 / 10);
- `cycleStartedOn`; `status` HEALTHY / TOPPED_UP / LOW / CRITICAL / CLOSED; `deletedAt`.
- Referenced by replenishments and vouchers.

**Fixed Asset Categories** (`FixedAssets.FixedAssetCategories`; audited)
- `code` and `name` (both unique), `defaultMethod` WDV / SLM / NONE, `defaultRatePct` (0–100];
- `costAccountId` (required), `accumDepAccountId`, `depExpenseAccountId`, `tagPrefix`, `status`, `deletedAt`;
- **check:** method NONE ⇔ no rate; otherwise the rate and both depreciation accounts are required.
- Referenced by assets and depreciation runs.

**FBR Settings** (`Tax.FbrSettings` + `FbrBranchMappings`; audited)
- One row per `authority` (FBR / PRA); `environment` SANDBOX / PRODUCTION; `posId` 4–10 digits; `ntn`, `strn`;
- `apiTokenSecretRef`, `apiTokenHint`, `tokenExpiresOn`;
- `reportOnPosting`, `printQr`, `blockIfUnreachable`, `syncIntervalMinutes` 1–1440;
- `connectionStatus` NOT_CONFIGURED / CONNECTED / DEGRADED / DISCONNECTED; a status other than NOT_CONFIGURED needs a token;
- health and sync timestamps, filled from Phase 28.
- **Branch mappings:** `branchId` (null = all branches) → `posId`, unique per setting and branch.

**Segregation-of-Duties Rules** (`Company.SegregationOfDutiesRules`; audited)
- `code` `^[A-Z][A-Z0-9_]{2,40}$`, `name`;
- `kind` CREATE_APPROVE / CREATE_POST / PRIVILEGE_ESCALATION / CUSTOM;
- `permissionA` and `permissionB` → `Company.Permissions` (different, the pair unique);
- `severity` WARN / BLOCK, `ownerExempt` (true), `isActive`.
- All 16 seed pairs exist in the permission catalogue.

**Not yet in the DB:** a secrets table (added in this phase).

**Unresolved:** none.

## 3. Template → page mapping
| Entity | Template | Page / component | Notes |
|---|---|---|---|
| Bank Rules | `4A-company-plus.html` `app/bank/rules` + `9A-company-plus.js` §9 | `/bank/rules` | **Rule cards:** IF … THEN categorise to account / cost centre; enabled switch; usage count. **Rule builder drawer:** conditions with Match all / any, account, cost centre, bank account, priority, auto-post. **Live preview:** "would match N lines" against sample lines you paste (no statements yet). Statement import and Raast matching are Phase 17 (omitted). |
| Petty Cash Funds | `40-acc-core.html` `app/cash/petty` | `/cash/petty` | **From the template:** fund cards (imprest, custodian, status) and the "Imprest position" panel. **New / edit fund:** a template-styled drawer. **Later phases:** Top-up and Record expense (Phase 18). |
| Fixed Asset Categories | none (`app/assets` is the asset register) | `/assets/categories` | Template-styled page: table + drawer (method, rate, three GL accounts, tag prefix). The register arrives in Phase 27 and links here. |
| FBR Settings | `42-acc-reports.html` `app/tax/fbr` | `/tax/fbr` | **From the template:** KPI cards, the Credentials panel (environment, POS ID, NTN / STRN from the company profile, write-only token showing its hint), behaviour switches, connection history (from row history). **Additions:** FBR / PRA tabs; the template's single "Branch mapping" select becomes a small mapping table. **Disabled with a note:** sync log, Test connection, Sync now (Phase 28). |
| SoD Rules | none for managing rules (the roles screen only shows conflicts) | "Segregation of duties" tab on `/settings/roles` | Template-styled table + drawer. The existing conflict banner now reads the database rules. |

**Sidebar:**
- Bank › Bank Rules
- Cash › Petty Cash
- **Fixed Assets** (new module) › Asset Categories
- Tax & Compliance › FBR Integration

**Pages** use the `Screen` route wrapper so the template's per-screen CSS applies.

## 4. Clean Architecture
| Layer | Module | Responsibility |
|---|---|---|
| Contracts | `src/shared/treasury/{bank-rule,petty-cash}.ts`, `src/shared/assets/category.ts`, `src/shared/tax/fbr.ts`, `src/shared/access/sod-rule.ts` | Zod mirrors of the DB checks (codes, condition value per field, % ranges, method ⇔ rate ⇔ accounts, POS ID); `patchFields` for PATCH bodies |
| Domain | `bank-rules/domain/match.ts` (pure condition matcher, also used by the preview and Phase 17); `sod.ts` becomes rule-driven (`sodConflicts(grants, rules)`) | Pure logic |
| Application | services per entity; `SecretBox` port (encrypt / decrypt) | Postable / active account checks (GlLinks); one fund per cash account; fund ↔ cash account sync in one unit of work; SoD Block check on role save; in-use checks (`isReferenced`) |
| Infrastructure | Prisma stores via `*AddUpdate`; `AesGcmSecretBox` (Node crypto, key from `APP_ENCRYPTION_KEY`) | Persistence, encryption |
| Server adapter | `/api/bank/rules`, `/api/cash/petty-funds`, `/api/assets/categories`, `/api/tax/fbr`, `/api/settings/sod-rules` | Guards, Zod, unit of work |
| UI | `src/features/treasury/*`, `src/features/assets/*`, `src/features/tax/*`, access roles tab | Screens above |

## 5. API contracts (under `/api`, tenant from the session)
| Method & path | Notes | Permission | Errors |
|---|---|---|---|
| `GET/POST /bank/rules`, `PATCH/DELETE /bank/rules/:id`, `POST /:id/enable`, `/disable` | Conditions replaced as a list; code `BR-NN` auto-assigned when blank | `bank:*` | 422 `ACCOUNT_NOT_POSTABLE`; 400 condition values; 409 `BANK_RULE_IN_USE` |
| `PUT /bank/rules/order` | `[id…]` → priorities 10, 20, … | `bank:edit` | |
| `POST /bank/rules/:id/test` (and `/bank/rules/test` for an unsaved draft) | Body: sample lines `{ description, reference, amount }[]` → which match, and which rule wins by priority | `bank:view` | |
| `GET/POST /cash/petty-funds`, `PATCH /:id`, `POST /:id/close`, `/reopen`, `DELETE /:id` | Create: name, branch, custodian, imprest, low / critical %, cash account `{ mode: 'create' } \| { mode: 'link', cashAccountId }` | `cash:*` | 422 custodian not active; 409 `PETTY_FUND_ACCOUNT_TAKEN`; 409 `PETTY_CASH_FUND_IN_USE` |
| `GET/POST /assets/categories`, `PATCH /:id`, `POST /:id/activate`, `/deactivate`, `DELETE /:id` | | `fa:*` | 400 method / rate / accounts; 422 `ACCOUNT_NOT_POSTABLE` (cost = asset class, accumulated depreciation = asset class, expense = class 5); 409 `ASSET_CATEGORY_IN_USE` |
| `GET /tax/fbr` (both authorities + mappings; token as hint only), `PUT /tax/fbr/:authority` (settings + `apiToken?` + mappings) | | view `tax:view`; save `tax:edit` | 400 POS ID / interval; token never echoed |
| `GET/POST /settings/sod-rules`, `PATCH /:id`, `POST /:id/activate`, `/deactivate`, `DELETE /:id` | Seeded rules can be edited or deactivated but not deleted | view `rol:view`; change `rol:edit` | 409 duplicate pair; 422 `SOD_CONFLICT_BLOCKED` on role save |

- **Delete vs deactivate:** delete only when unused (`isReferenced`, soft delete where `deletedAt` exists). Otherwise: disable a rule, close a fund, deactivate a category or SoD rule. Codes are never reused (`CODE_RETIRED`).
- **Concurrency:** `rowVersion` everywhere.
- **Lists:** small; loaded whole.

## 6. Database changes: `prisma/sql/011-treasury-rules.sql` (idempotent, added to `db:sql`)
1. **`Company.TenantSecrets`:**
   - columns: id, tenantId, purpose, `ciphertext`, `iv`, `authTag`, `keyVersion`, stamps, rowVersion;
   - stamp/touch triggers; `triggerAuditRedacted` on the cipher columns;
   - `isReferenced` covers the new tables.
2. **SoD seed:**
   - `Company.seedSodRulesFor(pTenant)` with the 16 rules from `sod.ts`, all WARN and owner-exempt;
   - an `AFTER INSERT` trigger on `Platform.Tenants`; Demo backfilled.
3. **Error codes:** `BANK_RULE_IN_USE`, `PETTY_FUND_ACCOUNT_TAKEN`, `PETTY_CASH_FUND_IN_USE`, `ASSET_CATEGORY_IN_USE`, `SOD_CONFLICT_BLOCKED`, `SOD_RULE_SEEDED`.
4. **Readable labels** for the Phase 5 lookups ("Description", "Amount", "Written-down value", "Straight line", …).

`.env.example` gains `APP_ENCRYPTION_KEY`. I'll generate a value into your `.env` without printing it.

## 7. Audit (row history)
- **Tables covered:** all 7 + `TenantSecrets` (redacted).
- **User attribution:**
  - App changes run in the signed-in user's unit of work.
  - Creating a fund with a new cash account and GL account is one transaction, attributed to the same user and request.
- **History view:** History in each drawer, and the FBR "Connection history" panel shows the settings' row history.

## 8. Ordered tasks
1. **Roadmap:**
   - Phase 5 `in-progress`;
   - asset categories and SoD rules: template notes;
   - FBR test-connection moved to Phase 28;
   - `npm run delivery:roadmap` must pass.
2. **Database:** `011-treasury-rules.sql` (×2); Prisma models; `addUpdate` map.
3. **Contracts, domain** (condition matcher, rule-driven SoD), **secrets port**.
4. **Server:** services, stores, controllers, history registration; the role save uses DB SoD rules.
5. **Pages:**
   - `/bank/rules`, `/cash/petty`, `/assets/categories`, `/tax/fbr`;
   - the SoD tab on `/settings/roles`;
   - sidebar entries.
6. **Wire the flows;** then verification (§9) and the acceptance request.

## 9. Verification
- **API suite `api-p4`-style (`api-p5`):**
  - **Bank rules:** create (auto code), condition validation (AMT not a number, TYPE not IN/OUT), non-postable account, reorder, test endpoint returns the right matches and winner, disable, delete unused.
  - **Petty fund:** create with a new account (cash account + GL created, imprest synced); link an existing petty account; a second fund on the same account → 409; critical ≥ low → 400; inactive custodian → 422; edit the imprest → the cash account follows; close / reopen; delete unused.
  - **Asset categories:** WDV without a rate → 400; NONE with a rate → 400; wrong account classes → 422; CRUD; delete unused.
  - **FBR:**
    - save settings and mappings with a token: the response has the hint only;
    - the DB holds ciphertext only, and decrypting round-trips;
    - history redacts the token;
    - bad POS ID → 400.
  - **SoD:**
    - Demo has 16 rules;
    - set one to Block → saving a role with that pair → 422 `SOD_CONFLICT_BLOCKED`, while the Admin role stays exempt;
    - a custom rule appears in the roles screen conflicts;
    - deleting a seeded rule → 409.
  - **Permissions:** auditor views only; cashier can manage petty funds but not bank rules, FBR or asset categories; salesman no access.
  - **History:** real user and session on every write (psql).
- **Regression:** the Phase 2–4 API suites re-run (roles save path changes).
- **Visual:** `/bank/rules`, `/cash/petty`, `/tax/fbr` next to their templates; `/assets/categories` and the SoD tab checked for consistency; 1400×900 and 390×844, light and dark.
- **Build:** both typechecks, lint + lint:arch, roadmap check, SQL run twice.
- **Cleanup:** test data removed and soft-deleted test rows purged, so no real codes are retired.

## 10. Acceptance criteria, risks, blockers
- **Acceptance:** §9 passes; deviations are listed in the acceptance request.
- **Risks:**
  - Encryption key handling: losing `APP_ENCRYPTION_KEY` makes stored tokens unreadable (they'd need re-entering). I'll note this in `.env.example`.
  - The SoD move must keep today's warnings identical. The seed mirrors the code rules, and the roles API suite re-runs.
- **Blockers:** none.

---
**Approve Phase 5 revision 1 for implementation?**
