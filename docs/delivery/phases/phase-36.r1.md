# Phase 36 rev 1: Plans & catalogue (+ Super Admin foundation)

> **Status: approved 2026-10-07 (revision 1).** Planned together with Phases 37, 38 and 39, which run in parallel with Phase 16 (another session).

**Objective:** the Super Admin's commercial catalogue: subscription plans with module features and limits, platform modules with per-plan inclusion, add-ons, and coupons. Phases 37–39 are blocked until the shared Super Admin foundation (shell, admin attribution, platform history) lands, so it is built first.

**Entities (4, MASTER):** Subscription Plans · Platform Modules · Add-ons · Coupons

**Decisions (2026-10-07):**
- **The Super Admin is mirrored as a `PlatformStaff` row,** so history and flag ownership get a real id.
- **Plans are versioned by a new plan row on price change.**
- Shared admin decisions: see Phases 37 and 38.

## 0. Super Admin foundation (task 1; Phases 37–39 start building once it lands)

| Piece | What |
|---|---|
| **Admin identity** (SQL 101) | Add a `Platform.PlatformStaff` row for the single Super Admin, linked from `Platform.PlatformAdmin` (new nullable column `staffId`). Backfilled for the existing admin, idempotent. |
| **Admin audit context** | An admin `UnitOfWork.run(adminActorContext(admin, meta))` sets `app.userId` = staff id, `app.actorLabel` = `Super Admin <email>`, IP, user agent and correlation ID. `tenantId` is null. `Company.writeAuditEntry` already routes Platform-schema rows to `Platform.PlatformAuditLogs`. |
| **Platform history** (SQL 101) | `Platform.getPlatformRecordHistory(pTable text, pId uuid, pChildFk text[])`: the versions of one record, newest first, plus its child-table rows found via their parent FK in `rowData`. Backed by an expression index on `PlatformAuditLogs ((rowData->>'id'))`. Endpoint `GET /api/admin/history/:table/:id` (`@AdminRoute`, allow-list `src/server/modules/platform-admin/history/admin-history-tables.ts`). Reusable `AdminHistoryTab` component. |
| **Admin shell** | Parameterise the Phase 0 shell (`src/features/shell/components/{app-shell,sidebar,topbar}.tsx`: nav, crumbs, home link, user menu, footer) and add an `AdminShell`, faithful to the template's `NAV.admin` / `TOP.admin` (`template/src/90-nav.js`, `99-app.js`): "Platform Console" brand, Overview / Onboard tiles, the template's groups, admin topbar (workspace pill "Accountex Cloud · Production", create menu, breadcrumb root "Platform"). The workspace shell keeps working unchanged. |
| **Admin nav** | `src/features/admin-nav/nav.ts`, same shape as `workspace-nav/nav.ts`. Each phase adds only its own entries; routes without a built page are hidden. |
| **Styles** | Port the template's admin CSS (`1B-admin-plus.css` `ap-*`, `1J-flags.css` `ff-*`) to `src/app/styles/` once, for all four phases. |
| **Registries** | Platform functions added to `add-update.ts` FUNCTIONS (schema `Platform`); Platform tables to `references.ts`. |
| **Layout** | `src/app/admin/(portal)/layout.tsx` uses `AdminShell`. `/admin/dashboard` stays a heading until a later phase. |

## 1. Selection rationale
| Entity | Depends on | Why now |
|---|---|---|
| Subscription Plans | none (4 plans seeded: STARTER, GROWTH, BUSINESS, ENTERPRISE) | Subscriptions, invoices and usage (40, 41) reference plans |
| Platform Modules | Plans | Entitlements; flag prerequisites (39) reference modules |
| Add-ons | Modules, plans | Tenant add-ons (40), usage alerts (39) |
| Coupons | Plans; partner → Resellers (38, optional) | Platform invoices (41) |

## 2. Verified schema (live DB)

**`Platform.SubscriptionPlans`**
- Columns:
  - `code` `^[A-Z][A-Z0-9_]{1,19}$` (unique), `name`, `tagline`;
  - `priceMonthly`, `priceAnnual` ≥ 0, `extraSeatPrice`, `isCustomPrice`;
  - `userSeats`, `storageGb` > 0;
  - `trialDays` ∈ {0, 14, 30};
  - `sortOrder`, `isPublic`;
  - `status` (ACTIVE / RETIRED);
  - `supportChannel`, `supportResponseHours`, `slaUptimePct` 90–100.
- **No `deletedAt`.**
- **No audit trigger → added.**

**`Platform.SubscriptionPlanFeatures`** (48 rows)
- Columns: `moduleKey` (ModuleKey lookup), `inclusion` (INCLUDED / ADDON / NOT_AVAILABLE), `addonPrice` (required for ADDON).
- **No audit trigger → added.**

**`Platform.SubscriptionPlanLimits`** (0 rows)
- Columns: `usageMeterId` → `UsageMeters` (0 rows, Phase 40), `limitValue`, `overagePrice`.
- Trigger `platformPlanLimitSync` copies USERS / STORAGE_GB limits to the plan.
- Already audited.
- **The limits editor shows meters only once Phase 40 seeds `UsageMeters`;** until then it is an empty state.

**`Platform.PlatformModules`**
- Columns:
  - `key` `^[a-z][a-z0-9_.]{2,59}$` (unique), `name`, `icon`;
  - `kind` (MODULE / FEATURE), `entGroup`, `moduleKey`;
  - `featureFlagId` → FeatureFlags (Phase 39, optional), `minPlanId`;
  - `isCore` (must stay enabled), `isEnabled`, `sortOrder`, `deletedAt`.
- Already audited.

**`Platform.PlatformModulePlans`**
- Columns: (`platformModuleId`, `planId`) unique, `isIncluded`.
- Already audited.

**`Platform.Addons`**
- Columns:
  - `code` `^[A-Z][A-Z0-9_]{1,39}$`, `name`, `icon`;
  - `price`, `billingUnit` lookup, `usagePrice` / `usageUnit`, `note`;
  - `platformModuleId`, `isActive`, `deletedAt`.
- Already audited.

**`Platform.AddonPlans`**
- Columns: `availability` (AVAILABLE / INCLUDED / NOT_AVAILABLE).
- **No audit trigger → added.**

**`Platform.SubscriptionCoupons`**
- Columns:
  - `code` citext `^[A-Za-z0-9-]{4,24}$` (unique);
  - `discountType` (PERCENT ≤ 100 / FLAT), `discountValue`;
  - `duration` (ONCE / MONTHS_3 / MONTHS_6 / MONTHS_12 / FOREVER), `redemptionCap`;
  - `startsOn` ≤ `expiresOn`;
  - `newCustomersOnly`, `stackableWithPartner`, `partnerId` → Resellers;
  - `status` (SCHEDULED / ACTIVE / PAUSED / EXPIRED), `deletedAt`.
- Already audited.

**`Platform.SubscriptionCouponPlans`**
- **No audit trigger → added.**

**`Platform.SubscriptionCouponRedemptions`**
- **Read-only here** (append-only, written by billing in Phase 41).

**Write functions:** `subscriptionPlanAddUpdate` (`features[]`, `limits[]`), `platformModuleAddUpdate` (`plans[]`), `addonAddUpdate` (`plans[]`), `subscriptionCouponAddUpdate` (`plans[]`), plus their `get*Info`. All check `rowVersion`, and child arrays are replaced.

## 3. Template → page mapping
| Entity | Template | Page | Notes |
|---|---|---|---|
| Plans | `admin/plans` (`30-entry-admin.html:410`): plan cards, Monthly / Annual toggle, feature matrix, modal `#adm-edit-plan` | `/admin/plans` | From the template. **Added:** History tab, Retire, the remaining DB fields (support, SLA, seats price) in the modal. "Price history" lists the plan's retired versions. |
| Modules & entitlements | `admin/entitlements` (`3B-flags.html`, `9J-flags.js:1512+`): plan cards, feature matrix by group with ✓ toggles and Core locks, limits group, add-ons panel, save bar + "Review changes" drawer | `/admin/entitlements` | From the template. The "Modules by plan" table (minimum plan, per-plan switches, enabled) is the template's `admin/features` "Core modules" pane; it is placed here until Phase 39 builds `/admin/features`, then also shown there. |
| Add-ons | add-ons panel on `admin/entitlements` | same page + add-on modal (**template style**) | |
| Coupons | `admin/partners` Coupons tab (`3A-admin-plus.html:89`, `9B-admin-plus.js:1316+`): generator, ticket preview, "All coupons" table and row menu | `/admin/partners?tab=coupons` | From the template. The Resellers tab is Phase 38. Redemptions open as a read-only drawer. |

**Nav:** Billing › Plans & Billing › Plans & Pricing; Feature Management › Plan Entitlements; Growth › Partners & Coupons (the coupons tab now; resellers join with Phase 38).

## 4. Clean Architecture
| Layer | Location | Responsibility |
|---|---|---|
| Contracts | `src/shared/platform/{plan,module,addon,coupon}.ts` | Zod schemas |
| Domain | `src/server/modules/platform-admin/catalogue/*/domain` | Plan versioning rule; core-module rule; coupon date and percent rules |
| Application | `PlansService`, `ModulesService`, `AddonsService`, `CouponsService` | `UnitOfWork.run(adminActorContext)`; in-use checks; **price change on a plan with subscribers = copy as `<CODE>_V<n>` (ACTIVE) + retire the old one, in one transaction**; no subscribers = edit in place |
| Infrastructure | Prisma stores; the 4 `*AddUpdate` functions in the allow-list | |
| Server adapter | Controllers under `/api/admin/{plans,modules,addons,coupons}`, `@AdminRoute` | |
| UI | `src/features/platform-catalogue/*`; pages under `src/app/admin/(portal)/` | |

## 5. API contracts (all `@AdminRoute`; a tenant token gets 401/403)
| Method & path | Notes | Errors |
|---|---|---|
| `GET/POST/PATCH /api/admin/plans(/:id)`, `POST /:id/retire \| reactivate`, `PUT /:id/features`, `PUT /:id/limits`, `GET /:id/versions` | Price change with subscribers → returns the new version | 409 code, 409 `PLAN_IN_USE` (retire last public plan / delete), 409 stale |
| `GET/POST/PATCH/DELETE /api/admin/modules(/:id)`, `activate \| deactivate`, `PUT /:id/plans` | Core modules can't be disabled | 400 `MODULE_CORE_LOCKED`, 409 `MODULE_IN_USE` |
| `GET/POST/PATCH/DELETE /api/admin/addons(/:id)`, `activate \| deactivate`, `PUT /:id/plans` | | 409 code, 409 `ADDON_IN_USE` |
| `GET/POST/PATCH/DELETE /api/admin/coupons(/:id)`, `POST /:id/pause \| resume`, `GET /:id/redemptions` | Delete only without redemptions | 409 code, 409 `COUPON_IN_USE` |
| `GET /api/admin/history/:table/:id` | Foundation | 404 |

## 6. Database: `prisma/sql/101-admin-plans-catalogue.sql` (idempotent)
- **Foundation:** the `PlatformStaff` mirror + `PlatformAdmin.staffId`; `getPlatformRecordHistory`; the history expression index.
- **Audit triggers** on SubscriptionPlans, SubscriptionPlanFeatures, AddonPlans and SubscriptionCouponPlans.
- **Error codes** listed in §5.

## 7. Audit
- **Tables covered:** all 9 tables audited (redemptions read-only).
- **Attribution:** the Super Admin via the staff mirror. History rows show "Super Admin ‹email›".

## 8. Ordered tasks
1. Foundation: SQL 101 part 1, admin context, history endpoint, shell, nav, styles. **This unblocks 37 and 38.**
2. SQL 101 part 2, Prisma models, registries. **This unblocks 39**, which links to PlatformModules.
3. Contracts and services.
4. Pages.
5. Verify.

## 9. Verification
- **Functional:**
  - CRUD + reload for each entity;
  - seeded plans visible;
  - price change on a plan with a (test) subscription → new version + old retired; on an unused plan → edited in place;
  - core module can't be disabled;
  - coupon rules;
  - a tenant user's token is refused on `/api/admin/*`;
  - history rows name the Super Admin.
- **Visual:** `/admin/plans`, `/admin/entitlements`, `/admin/partners` coupons tab and the admin shell against the templates (light, dark, 390 px).

## 10. Acceptance, risks, blockers
- **Risks:**
  - **Limits editor:** empty until Phase 40 seeds usage meters.
  - **Shell edits** touch shared shell components; workspace screens must be re-checked visually.
- **Blockers:** none.
