# Phase 14 rev 1: Distribution setup

> Planned together with Phases 13, 14 and 15 for parallel implementation; approved 2026-10-07.

## Shared context (Phases 13–15)
**Status before this plan:**
- Phases 0–10 are `done`.
- **Phase 11 is `in-progress` in another session.** You asked for 13/14/15 to start in parallel; their roadmap dependencies are all `done`.
- Phase 12 is planned and is expected to use `prisma/sql/018-*`.

**Your decisions (2026-10-07):**
- **Screens with no admin template are built in template style.** They use only existing template components and are listed as deviations at acceptance.
- **Sign-in recovery moves out of Phase 15.** It goes to Phase 29 (Period close & work queue), where reminder runs also need email/SMS delivery; the provider is chosen then.
- **Order templates move to Phase 25,** where they live in the template (Quick Wholesale Entry).
- **Report Studio** = saved definitions, shares and schedules, plus a live read-only preview. Scheduled sending waits for Phase 35.

**Scope moves made from verified schema evidence:**
- **`CompetencyRatings`, `KeyResults` → Phase 33 (performance).** Each row hangs off one employee's review/goal (`performanceReviewId`, `goalId`), so they are not cycle setup.
- **`CompanyAnnouncementReads`, `PresenceStatuses` → Phase 34 (engagement).** They are per-employee runtime rows keyed by `employeeId`, and employees are still being built in Phase 11.

**Applies to all three phases:**
- **Employee-linked fields** (route staff, van default driver, policy/category owner) show "after Phase 11". They become selectable once Phase 11 is accepted, with no rework.
- **Each phase has its own SQL file,** in `npm run db:sql` order after 018:
  - `019-talent-setup.sql` (13);
  - `020-distribution-setup.sql` (14);
  - `021-self-service-setup.sql` (15).
- **Each phase is approved, accepted and marked `done` on its own.** On approval, the scope moves above are written into `docs/delivery/roadmap/*.ts` and `npm run delivery:roadmap` must pass.
- **Shared files are edited by all parallel sessions, including Phase 11. Add lines only:**
  - `prisma/schema.prisma`;
  - `src/server/infrastructure/prisma/add-update.ts` (FUNCTIONS) and `references.ts` (TABLES);
  - `src/server/modules/history/application/history-tables.ts`;
  - `src/features/workspace-nav/nav.ts`;
  - `src/server/modules/hr/hr.module.ts`, `src/server/app.module.ts`;
  - `package.json` `db:sql`.

  Git has no commits yet. **Make a first commit before starting**, so parallel edits can be reviewed and reverted.
- **Pattern per entity (as in Phase 10):** SQL (audit triggers, error codes, seeds) → Prisma models → registries → `src/shared/<module>` Zod contracts → `src/server/modules/<module>/<entity>/{application,infrastructure,presentation}` (writes via the existing `*AddUpdate` functions inside `UnitOfWork.run(actorContext…)`) → `src/features/<module>` screens (reuse `record-modal.tsx`, History tab) → `src/app/(app)/<route>/page.tsx` with `requirePermission`.
- **Every page** has loading, empty, validation, success, error and permission states.
- **Verification** follows the accepted habit:
  - an API suite per phase, run in a scratchpad as `api-pNN.mjs`;
  - typecheck, lint, `lint:arch` and `delivery:roadmap` all pass;
  - headless-Edge screenshots against the template (light, dark, 390 px);
  - psql check that history rows carry the real user;
  - test data cleaned up afterwards;
  - no automated test files.

---

**Objective:** the masters that order booking, load sheets and recovery run on: shop areas, routes with visit days, stops and shop assignment, vans, and commission slabs.

**Entities (4, MASTER):** Shop Areas · Routes · Vans · Commission Slabs (Order Templates → Phase 25)

## 1. Selection rationale
| Entity | Depends on (status) | Why now |
|---|---|---|
| Shop Areas | Branches (1) | Group shops on routes |
| Routes | Shop areas (this phase), customers (7), warehouses (6), vans (this phase); staff → employees (**11, in progress**) | Bookings, load sheets, recovery and invoices reference a route |
| Vans | Warehouses (6, VAN type) | Routes, load sheets and challans use a van |
| Commission Slabs | none | Salesman commissions (26) |

## 2. Verified schema (live DB; all tables empty; every `*AddUpdate` function exists; none of these tables is mapped in Prisma yet)

**`Distribution.ShopAreas`**
- Columns: `branchId`, `code` (unique when set), `name` + `city` (unique, case-insensitive), `status` (ACTIVE / INACTIVE), `deletedAt`.
- **Audit trigger missing → added.**

**`Distribution.Routes`**
- Columns:
  - `code` `^RT-[0-9]{2,4}$` (unique), `name`, `branchId`;
  - `sourceWarehouseId`, `vehicleId` → Vans;
  - `bookerEmployeeId`, `salesmanEmployeeId`, `driverEmployeeId`, `supervisorEmployeeId` → **HumanResources.Employees**;
  - `status`, `deletedAt`.
- Already audited.
- **`routeAddUpdate` needs numbering series `RT` when no code is sent; none exists → seeded.**

**`Distribution.RouteVisitDays`**
- Columns: `routeId`, `weekday` (MON–SUN, unique per route).
- **Audit trigger missing → added.**

**`Distribution.RouteStops`**
- Columns: `routeId`, `routeDayId`, `customerId`, `stopSeq` > 0, `plannedEta`.
- Unique: sequence per route/day, and customer per route/day.
- **FK** (`customerId`, `routeId`) → ShopRouteProfiles: **a stop needs a profile first.**
- **Audit trigger missing → added.**

**`Distribution.ShopRouteProfiles`**
- Columns:
  - `customerId` (**unique per tenant: a shop is on exactly one route**, which is stricter than the roadmap rule);
  - `routeId`, `areaId`;
  - `priceTier` → PriceTiers (default RETAILER);
  - `visitSeq`;
  - geo pair + `gpsToleranceM`;
  - `recoveryTargetAmount`, `isActive`.
- Already audited.
- Saved through `shopRouteProfileAddUpdate`.

**Behaviour of `routeAddUpdate`**
- It syncs `visitDays[]` and `stops[]`, deleting rows that are missing from the arrays. This has three consequences, all handled by the service:
  - **Stops wait for their visit days.** A new stop can't reference a visit day created in the same call, so the service saves visit days first and stops second.
  - **A visit day still holding stops can't be removed.** Doing so would hit an FK error, so it is mapped to 409 `ROUTE_DAY_HAS_STOPS`.
  - **Reordering goes through temporary sequence numbers.** Stops are first moved to offset values, then to their final order, so the unique index on sequence is never hit.

**`Distribution.Vans`**
- Columns:
  - `regNo` (citext, 3–20, unique), `model`;
  - `capacityCtn` > 0, `capacityKg` > 0;
  - `warehouseId` (**must be a VAN-type warehouse**: trigger; **one van per warehouse**);
  - `defaultDriverEmployeeId` (after Phase 11), `branchId`;
  - `status` (ACTIVE / INACTIVE / MAINTENANCE), `remarks`, `deletedAt`.
- Already audited.

**`Distribution.CommissionSlabs`**
- Columns: `label`, `fromPct` ≥ 0, `toPct` > `fromPct` (null = open-ended), `ratePct` 0–100, `effectiveFrom` ≤ `effectiveTo`, `deletedAt`.
- **No status column.**
- The DB blocks **overlap** (exclusion constraint). **Contiguity** (no gaps between bands) is enforced by the app.
- Already audited.

**Roles:** `ORDER_BOOKER`, `SALESMAN`, `DELIVERYMAN` exist. An employee's roles come through `Employees.appUserId` → `UserRoles`.

## 3. Template → page mapping (`template/src/4E-distribution.html` `app/wholesale/routes`, rendered by `9I-distribution.js` `renderRoutes`)
| Entity | Template part | Page / component | Notes |
|---|---|---|---|
| Routes | Route cards (`rt-cards`: code, name, Mon–Sun day chips, booker, salesman, van, driver); "New route" sheet; route map panel with ordered stop list; shop assignment board (`rt-board`: drag shops between routes) | `/wholesale/routes` → `RoutesScreen` | **From the template:** cards, day chips (at least one day), the new/edit route sheet, the ordered stop list with ETA and reorder, and the drag-and-drop board writing ShopRouteProfiles + stops. Staff selects show "after Phase 11". The map is a stylised stop sequence; real map tiles are out of scope. **Disabled until later phases:** "Build load sheet", "Open recovery sheet", "Optimise stop order". |
| Shop Areas | none | Area chips/filter on the shop board + "Manage areas" modal (**template style**) | Area is set per shop profile on the board |
| Vans | none (hard-coded `VANS` feeding the selects) | "Vans" panel on the same screen (table + record modal, **template style**) | The warehouse select lists only VAN-type warehouses; the empty state links to Inventory › Warehouses |
| Commission Slabs | Read-only "Commission slabs" table (Achievement \| Rate) | Same table made editable: band editor modal per effective period (**template style**) | "Who's here" and Commission columns stay empty until Phase 26 |

- **Later phases:** the "Bookers & salesmen" cards and the Leaderboard are empty states until Phase 26.
- **Nav:** new group **Wholesale & Distribution** › Routes & Salesmen (template `90-nav.js:187-199`; other items are added in their own phases).

## 4. Clean Architecture
| Layer | Location | Responsibility |
|---|---|---|
| Contracts | `src/shared/distribution/{shop-area,route,van,commission-slab}.ts` | Zod; `slabsContiguous(bands)` helper |
| Domain | `src/server/modules/distribution/*/domain` | Day / stop ordering; contiguity; staff-role rule (checked once employees exist) |
| Application | `ShopAreasService`, `RoutesService` (header, days, stops, assignment, shop moves), `VansService`, `CommissionSlabsService` | `UnitOfWork.run`; in-use checks; two-step save for days → stops; temporary-sequence reorder |
| Infrastructure | Prisma stores; allow-list: `shopAreaAddUpdate`, `routeAddUpdate`, `shopRouteProfileAddUpdate`, `vanAddUpdate`, `commissionSlabAddUpdate` | Mirrors the Phase 8 kits header+lines store |
| Server adapter | New `DistributionModule` in `app.module.ts` | Guards and actor context |
| UI | `src/features/distribution/*`; `src/app/(app)/wholesale/routes/page.tsx` | As §3 |

## 5. API contracts
| Method & path | Permission | Errors |
|---|---|---|
| `GET/POST/PATCH/DELETE /api/distribution/shop-areas(/:id)`, `activate \| deactivate` | `route:*` | 409 code / name, 409 `SHOP_AREA_IN_USE` |
| `GET/POST/PATCH/DELETE /api/distribution/routes(/:id)`, `activate \| deactivate`; `PUT /:id/stops` (ordered list); `PUT /:id/assignment` (booker, salesman, van, driver, supervisor); `PUT /api/distribution/shop-profiles/:customerId` (route, area, visit sequence, price tier) | `route:*` | 409 code, 400 no visit day, 409 `ROUTE_DAY_HAS_STOPS`, 409 `ROUTE_STAFF_ROLE_MISMATCH`, 409 `ROUTE_IN_USE` |
| `GET/POST/PATCH/DELETE /api/distribution/vans(/:id)`, `POST /:id/status` | `van:*` | 409 regNo, 409 warehouse already used, 400 `VAN_WAREHOUSE_TYPE`, 409 `VAN_IN_USE` |
| `GET /api/distribution/commission-slabs?asOf`, `PUT /api/distribution/commission-slabs` (replace the bands of one effective period), `DELETE …/:id` | view `target:view`; edit `target:edit` (no `target:delete` exists, so delete uses `target:edit`) | 400 `COMMISSION_SLABS_NOT_CONTIGUOUS`, 409 overlap |

- **Delete vs deactivate:** delete only when unreferenced (soft delete); otherwise deactivate. Vans use `status` (MAINTENANCE included). Slabs have no status, so a slab is ended by setting `effectiveTo`.
- **Concurrency:** `rowVersion` on every write; stale → 409.

## 6. Database: `prisma/sql/020-distribution-setup.sql` (idempotent)
- **Audit triggers** on ShopAreas, RouteVisitDays and RouteStops.
- **Per-tenant numbering series `RT`** (format `RT-NN`), backfilled.
- **Error codes** for every code in §5.
- No new tables.

## 7. Audit
- **Tables covered:** all 7 tables (`ShopAreas`, `Routes`, `RouteVisitDays`, `RouteStops`, `ShopRouteProfiles`, `Vans`, `CommissionSlabs`) are audited.
- **Attribution:** actor context on every write.
- **History:** a History tab on route, van, area and slab.
- **Registry:** `history-tables.ts` entries with `route:view`, `van:view`, `target:view`.

## 8. Ordered tasks
1. SQL 020; Prisma models; registries.
2. Contracts.
3. `DistributionModule` services and controllers.
4. Routes screen from the template, plus template-style vans, areas and slab editors; nav.
5. Wire up.
6. Verify.

## 9. Verification
- **Functional:**
  - **Routes:**
    - CRUD + reload; RT-NN numbering;
    - visit days (at least one); day with stops can't be removed;
    - stops add / reorder / remove;
    - shop moved between routes (one route per shop);
  - **Vans:** non-VAN warehouse rejected; one van per warehouse;
  - **Commission slabs:** a gap is rejected, an overlap is rejected;
  - in-use blocks;
  - **Permissions:** salesman read per grants, auditor read-only, storekeeper 403;
  - history attributed to the real user.
- **Visual:** `/wholesale/routes` against `template/index.html#/app/wholesale/routes` (light, dark, 390 px). Vans, areas and slab editors are template-style deviations.

## 10. Acceptance, risks, blockers
- **Risks:**
  - **Staff assignment stays empty until Phase 11 is accepted.** The staff-role check is verified then.
  - **Vans need a VAN-type warehouse** (Inventory › Warehouses) before linking.
- **Blockers:** none.

---
**Approved:** Phase 14 revision 1 (2026-10-07).
