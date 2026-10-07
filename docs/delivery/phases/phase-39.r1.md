# Phase 39 rev 1: Feature flags & alerting

> **Status: approved 2026-10-07 (revision 1).** Planned with Phases 36, 37 and 38, in parallel with Phase 16. **Starts after Phase 36's SQL and models land:** flags and modules reference each other (`PlatformModules.featureFlagId`, `FlagPrerequisites.prerequisiteModuleId`), and usage alerts reference plans and add-ons. It also reuses Phase 38's segment matcher (segment keys are a soft text link, so it builds in parallel).

**Objective:** feature flags with environments, variations, targeting rules, individual targets, percentage rollouts, prerequisites and SDK keys, plus an evaluation endpoint. Also maintenance windows, usage alert rules and audit alert rules.

**Entities (4, MASTER):** Feature Flags · Maintenance Windows · Usage Alert Rules · Audit Alert Rules

**Decision (2026-10-07):** the Super Admin is mirrored as a `PlatformStaff` row (Phase 36), so every flag has an owner (`ownerStaffId` is NOT NULL).

## 1. Selection rationale
| Entity | Why now |
|---|---|
| Feature Flags | Gradual rollouts and kill switches for every later feature; change requests (43) build on flags |
| Maintenance Windows | Status page and announcements (42, 43) |
| Usage Alert Rules | Usage metering (40) evaluates them |
| Audit Alert Rules | Security alerting on the platform audit log |

## 2. Verified schema (live DB; all empty)

**`Platform.FeatureFlags`**
- Columns:
  - `key` snake_case 3–60 (unique, **immutable** by trigger), `name`, `description`;
  - `flagType` / `secondaryType` (RELEASE / KILL / OPS / EXPERIMENT / ENTITLEMENT, must differ);
  - `category`, `stage` (DEFINE → DEVELOP → PRODUCTION → CLEANUP → ARCHIVED; `archivedAt` set exactly when ARCHIVED);
  - `ownerStaffId` NOT NULL, `tags[]` ≤ 20;
  - `variationKind` (BOOLEAN / MULTIVARIATE);
  - `isTemporary` ⇒ `expiresOn`, stale fields.

**`Platform.FlagEnvironments`**
- One row per (flag, DEV / STAGING / PRODUCTION) with `isOn`.

**`Platform.FlagVariations`**
- Columns: `idx` 0–19, `name`, `value` (unique per flag).

**`Platform.FlagRules`**
- Columns: per environment, `position` (deferrable unique), `attribute` (SEGMENT, PLAN, REGION, CITY, INDUSTRY, AGE_DAYS, USER_ROLE, APP_VERSION, PLATFORM), `operator`, `ruleValues[]`, `serveVariationIdx`.

**`Platform.FlagTargets`**
- Columns: per environment, `tenantId` → `variationIdx`.

**`Platform.FlagPrerequisites`**
- Columns: per environment, another flag + required variation, **or** a `PlatformModule`.
- Not self.

**`Platform.FlagDefaultRules`**
- One per environment: VARIATION or ROLLOUT (`rolloutPct` 0–100, rollout / rest variations differ), `offVariationIdx`, `bucketBy` (TENANT_CODE / TENANT_ID).

**`Platform.FlagSdkKeys`**
- Columns: per environment and kind (SERVER / CLIENT / MOBILE), hash or client ID, `status` ACTIVE / GRACE (needs `validUntil`) / REVOKED.
- One ACTIVE per environment and kind.

**Function and log problems, fixed in this phase's SQL:**
- `featureFlagAddUpdate` and `getFeatureFlagInfo` key prerequisites on `prerequisiteFlagId = vRet` instead of `flagId`.
- They don't handle rules, targets or default rules at all.
- **Nothing writes `Platform.FlagAuditLogs`** (append-only, `eventKind` CREATED / TOGGLED / TARGETING / LIFECYCLE / KILL_SWITCH / …).
- **There is no cycle check and no evaluation function.**

**`Platform.MaintenanceWindows`**
- Columns:
  - `title`, `message`, `startsAt` < `endsAt`;
  - `components[]` ⊆ 8 values;
  - `bannerLeadHours` ∈ {1, 24, 72}, `readOnlyMode`;
  - `status` (SCHEDULED / IN_PROGRESS / COMPLETED / CANCELLED).
- Already audited.

**`Platform.UsageAlertRules`**
- Columns:
  - `usageMeterId` (null = any; meters are seeded in Phase 40), `thresholdPct` 50–150, `planId`;
  - `action` (EMAIL_OWNER / NOTIFY_ACCOUNT_MANAGER / THROTTLE needs `throttleRps` / BLOCK / OFFER_ADDON needs `offerAddonId`);
  - `isEnabled`, `evalIntervalMinutes`.
- Already audited.

**`Platform.AuditAlertRules`**
- Columns: `name`, `actionPattern`, `resultFilter`, `thresholdCount` > 0, `windowMinutes`, `channels` ⊆ {EMAIL, SLACK}, `recipients`, `isActive`.
- **Audit trigger missing → added.**

## 3. Template → page mapping
| Entity | Template | Page | Notes |
|---|---|---|---|
| Feature Flags | `admin/features` (`3B-flags.html`, `9J-flags.js`): KPIs (from view `getFeatureFlagSummary`), tabs Flags / Core modules / SDK keys, environment switch, filters and chips, flags table (Flag, Type, Lifecycle, Envs, Rollout, Prerequisites, Owner, Last evaluated, Production toggle, ⋮), row menu, kill-switch confirm (type the key), "New flag" 5-step wizard sheet | `/admin/features` | From the template. **Production toggle:** applied directly with the kill-switch confirm. The change-request path (badge, approval) is Phase 43, so it shows empty / disabled. The "Core modules" tab is Phase 36's modules-by-plan table. |
| Flag detail | `admin/features/view`: lifecycle stepper, environment tabs, targeting (on / off, individual targets, rule builder, default rule with rollout slider and 100-bucket grid, off variation), prerequisites, About / Variations / Tenants served side panels, save bar | `/admin/features/[id]` | From the template. **Evaluation chart and code references are empty** (no evaluation telemetry yet); scheduled changes are Phase 43. The audit diff reads `FlagAuditLogs`. |
| Maintenance Windows | `admin/status` "Schedule maintenance" form (date, start, duration, banner lead, message, component chips) + banner preview + "Upcoming windows" | `/admin/status` (maintenance part) | From the template. **Added:** a read-only-mode switch (in the DB, not the template), edit / cancel. Incidents are Phase 43 (empty). |
| Usage Alert Rules | `admin/usage` "Alert rules" panel + "New alert rule" modal (meter, threshold slider, plans, action, live sentence) | `/admin/usage` (alert rules part) | From the template. Meters list "Any meter" until Phase 40 seeds them. |
| Audit Alert Rules | `admin/audit` "Alert rules" drawer (static rows; "Add rule" is only a toast) | `/admin/audit` (rules drawer) | Rule list from the template; **create / edit form is template style.** The audit log table itself is read-only platform history (shown, not managed). |

**Nav:** Feature Management › Feature Flags, Flag Detail (hidden link); Operations › Status & Incidents, Platform Audit Log; Billing › Usage & Quotas.

## 4. Clean Architecture
`src/shared/platform/{flag,maintenance,alert-rule}.ts` → `src/server/modules/platform-admin/flags/*`:
- **Domain** (pure):
  - **flag evaluator**, porting the template's `evaluate()`:
    1. prerequisites (off variation if one fails);
    2. environment off → off variation;
    3. individual targets;
    4. rules, first match wins (SEGMENT rules via Phase 38's segment matcher);
    5. default rule (rollout bucket = hash(bucket key + '.' + flag key) % 100 < pct, or a fixed variation);
  - prerequisite cycle check (DFS over flags);
  - lifecycle order;
  - variation index rules.
- **Application:**
  - `FlagsService`: one `UnitOfWork.run(adminActorContext)` per save, writing FlagAuditLogs with the matching `eventKind`;
  - `MaintenanceService`, `UsageAlertRulesService`, `AuditAlertRulesService`.
- **Infrastructure:** Prisma stores; the fixed `featureFlagAddUpdate` for the flag + environments + variations + prerequisites; direct writes for rules, targets and default rules per environment (in the same transaction); SDK key hashing.
- **Controllers** `/api/admin/...` → `src/features/platform-flags/*` → pages.

## 5. API contracts (`@AdminRoute`)
| Method & path | Notes | Errors |
|---|---|---|
| `GET/POST/PATCH /api/admin/flags(/:id)`, `POST /:id/stage`, `POST /:id/archive \| restore`, `POST /:id/duplicate` | Create builds 3 environments, variations and default rules | 409 key, 400 type / variation rules, 409 stale |
| `PUT /api/admin/flags/:id/environments/:env` (rules, targets, default rule, off variation, prerequisites) | Full targeting for one environment | 400 rule / operator, 409 `FLAG_PREREQUISITE_CYCLE` |
| `POST /api/admin/flags/:id/toggle?env=` | Kill switches need `{ confirmKey }` | 400 `FLAG_KILL_CONFIRM_REQUIRED` |
| `GET /api/admin/flags/:id/evaluate?tenant=&env=` | Returns the variation and the reason (prerequisite / off / target / rule n / rollout bucket / default) | 404 |
| `GET /api/admin/flags/summary` | KPI view | — |
| `GET/POST /api/admin/flags/sdk-keys`, `POST /sdk-keys/:id/rotate \| revoke` | Secret shown once; rotation puts the old key in GRACE for 24 h | 409 already revoked |
| `GET/POST/PATCH /api/admin/maintenance-windows(/:id)`, `POST /:id/cancel` | Overlapping windows allowed (status page shows both) | 400 time / components |
| `GET/POST/PATCH/DELETE /api/admin/usage-alert-rules(/:id)`, `POST /:id/enable \| disable` | | 400 action detail |
| `GET/POST/PATCH/DELETE /api/admin/audit-alert-rules(/:id)`, `activate \| deactivate` | Evaluation and sending come with email delivery (Phase 29) | 400 pattern / channels |
| **Workspace:** `GET /api/me/flags` | The signed-in tenant's evaluated flags for the PRODUCTION environment (keys → variation), cached per request | — |

## 6. Database: `prisma/sql/104-admin-flags-alerting.sql` (idempotent)
- Fixes to `featureFlagAddUpdate` / `getFeatureFlagInfo` (prerequisites keyed on `flagId`).
- A `Platform.flagAuditWrite(...)` helper used by the service.
- An audit trigger on AuditAlertRules.
- Error codes listed in §5.

## 7. Audit
- **Tables covered:** all 12 tables audited (platform log).
- **Flag events:** also written to `FlagAuditLogs` with the before / after of what changed.
- **Attribution:** the Super Admin (staff mirror).

## 8. Ordered tasks
1. *(Wait for Phase 36 step 2.)* SQL 104; Prisma models; registries.
2. Evaluator and cycle check.
3. Services and controllers.
4. Pages (flags list, wizard, detail; status, usage, audit parts).
5. Workspace `GET /api/me/flags`.
6. Verify.

## 9. Verification
- **Functional:**
  - **Flags:**
    - create via the API (3 environments, boolean and multivariate);
    - key immutable;
    - lifecycle order;
    - targeting saved per environment;
    - prerequisite cycle → 409;
    - kill switch needs the typed key.
  - **Evaluator:** cases for a prerequisite failing, environment off, an individual target, a rule match (PLAN, SEGMENT via a Phase 38 segment), a 50 % rollout (stable bucket per tenant) and a fixed default.
  - **Workspace:** `/api/me/flags` returns the Demo tenant's variations.
  - **SDK keys:** shown once; rotate → GRACE.
  - **FlagAuditLogs:** a row per change.
  - **Other entities:** maintenance window CRUD + cancel; usage and audit alert rules CRUD with action-detail rules.
  - History names the Super Admin; a tenant token is refused on `/api/admin/*`.
- **Visual:** `/admin/features`, the wizard, `/admin/features/[id]` and the maintenance / usage / audit parts against the templates.

## 10. Acceptance, risks, blockers
- **Risks:**
  - **The evaluation chart, code references and change requests are empty** until telemetry and Phase 43.
  - **Usage meters only appear after Phase 40.**
  - **Audit alerts are stored but not sent** until email delivery (Phase 29).
- **Blockers:** starts after Phase 36's database step.
