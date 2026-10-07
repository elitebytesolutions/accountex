# Phase 38 rev 1: Platform configuration

> **Status: approved 2026-10-07 (revision 1).** Planned with Phases 36, 37 and 39, in parallel with Phase 16. Starts building once Phase 36's Super Admin foundation lands.

**Objective:** platform-wide configuration: the dunning policy, tenant segments (rule-based audiences used by flags and broadcasts), resellers, and platform security (SSO / MFA / IP allow-list / password policy, API keys, webhooks, backups).

**Entities (4, MASTER):** Dunning Policies · Tenant Segments · Resellers · Platform Security

**Decision (2026-10-07):**
- **Store every security setting; enforce the safe parts on the Super Admin login now:**
  - IP allow-list;
  - failed-login lockout;
  - password policy.
- **A break-glass rule makes self-lock-out impossible.**
- **SSO and MFA are stored now and switched on with Phase 29's MFA work.**

## 1. Selection rationale
| Entity | Why now |
|---|---|
| Dunning Policies | Dunning cases (41) follow the active policy |
| Tenant Segments | Feature-flag rules (39) and broadcasts (42) target segments by key |
| Resellers | Coupons (36) link a partner; reseller tenants and payouts (41) |
| Platform Security | Hardens the Super Admin portal before tenant lifecycle and billing go live |

## 2. Verified schema (live DB; all tables empty)

**`Platform.DunningPolicies`**
- Columns:
  - `name`, `isActive` (**one active policy**, partial unique);
  - `graceDays` 1–20, `readOnlyDays` 0–20, `suspendedDays` 5–40, `archiveDays` > 0;
  - `retryHour` 0–23, `salaryRetryDays[]` 1–28;
  - `retrySchedule` jsonb array (NOT NULL, **no default**);
  - email / SMS / WhatsApp switches with offsets ⊆ {−3, 0, 1, 3, 7, 14};
  - `effectiveFrom`.
- Already audited.

**`Platform.TenantSegments`**
- Columns:
  - `key` `^segment\.[a-z][a-z0-9_]*$` (unique);
  - `name` citext (unique), `description`, `icon`;
  - `tone` (GREEN / BLUE / VIOLET / ORANGE / LIME / RED);
  - `deletedAt`.

**`Platform.TenantSegmentRules`**
- Columns:
  - `position` (deferrable unique);
  - `attribute` (PLAN, REGION, CITY, INDUSTRY, AGE_DAYS, SALES_TAX_REGISTERED, BETA, INTERNAL, APP_VERSION, PLATFORM);
  - `operator` (IN / NOT_IN; GT / LT only for AGE_DAYS and APP_VERSION);
  - `ruleValues[]`.

**`Platform.SegmentTenants`**
- **Manual INCLUDE / EXCLUDE overrides,** not computed membership.

**No evaluate function exists.** Membership = not excluded AND (included OR all rules match), the same as the template's `segMatch`.

**Resellers**
- Columns:
  - `name` (unique), `city`;
  - `tier` (BRONZE … PLATINUM), `commissionPct` 0–100, `nextTierTenants`;
  - contact, `email`, `phone`, `ntn`, `isActiveTaxpayer`;
  - `payoutMethod` (IBFT / CHEQUE), `bankName`, `ibanMasked` + `ibanEnc` (encrypted, never returned);
  - `inviteCode` (unique);
  - `status` (ACTIVE / SUSPENDED / TERMINATED), `deletedAt`.
- Already audited.

**`Platform.PlatformSecuritySettings`** (**single row, `id = 1`**)
- Columns:
  - **SSO:** SAML / Google fields (required pairs are checked), `requireSso`, `breakGlassSuperAdmin`;
  - **MFA:** `mfaEnforcement` (OPTIONAL / ADMINS / EVERYONE) + allowed methods (at least one);
  - **IP:** `ipAllowlistEnforced`;
  - **Password:** `pwMinLength` 8–24, mixed case / number / symbol / breached / reuse switches, `pwRotationDays` (null, 90, 180);
  - **Lockout:** `lockoutAttempts` (3, 5, 10), `lockoutMinutes` (15, 30, 60).

**`Platform.PlatformAllowedIps`**
- Columns: `cidr` (IPv4, unique), `label`, `isActive`.

**`Platform.PlatformApiKeys`**
- **Per tenant.** Columns:
  - `keyHash` (unique), `keyPrefix` `fs_live_` / `fs_test_` by environment, `keyLast4`;
  - rotation (`previousKeyHash` until `previousValidUntil`);
  - `scopes[]` (7 values);
  - `status` ACTIVE / REVOKED + `revokedAt` / `revokedByStaffId`.

**`Platform.WebhookEndpoints`**
- Columns: `tenantId`, https `url` (unique per tenant), `events[]`, `signingSecretEnc` + `secretLast4`, `pausedAt`.

**`Platform.WebhookDeliveries`**
- Columns: `attemptNo` 1–6, `status`, `replayOfId`.
- **Audit trigger missing → added.**

**`Platform.BackupRuns`**
- Columns: `backupType` (FULL / WAL / TENANT_EXPORT), `status` (RUNNING / COMPLETED / FAILED), `requestedByStaffId`, `retryOfId`.

**Existing DB function bugs fixed in this phase's SQL:**
1. `tenantSegmentAddUpdate` uses an undeclared `"vTenant"` when saving `tenants[]`.
2. `getPlatformSecuritySettingInfo(pId uuid)` ignores its argument → replaced by a no-argument reader of row 1.
3. `WebhookEndpoints_events_check` lists `'"Payroll".posted'` instead of `payroll.posted`.
4. `dunningPolicyAddUpdate` inserts NULL `retrySchedule` when omitted → defaults to `[]`.

**Admin login today** enforces only email + password, a 5-per-minute throttle and the cookie session (`src/server/modules/platform-admin`). The DB defaults (`ipAllowlistEnforced` true, `mfaEnforcement` EVERYONE) would lock you out if enforced blindly.

## 3. Template → page mapping
| Entity | Template | Page | Notes |
|---|---|---|---|
| Dunning Policies | `admin/dunning` (`3A-admin-plus.html`): the "Dunning policy" panel (grace / read-only / suspended drag track + inputs) and "Reminder channels" panel (switches + D−3…D+14 chips), saved with `data-pol-save` | `/admin/dunning` | Those two panels **from the template**. The KPIs, collections queue, retry timeline and "Promise to pay" are Phase 41 (empty states). **Template-style addition:** retry schedule rows and salary retry days. |
| Tenant Segments | `admin/segments` (`9J-flags.js` ~1370–1500): segment cards, rule builder (`mountRules`), match ring with plan breakdown, matching tenants preview, "New / Edit segment" modal (name, read-only key, description, icon, tone, start-from) | `/admin/segments` | From the template. **Template-style addition:** an include / exclude tenants panel (SegmentTenants). "Flags using this segment" lists flags once Phase 39 exists, and delete is blocked when flags use the segment. |
| Resellers | `admin/partners` Resellers tab: KPIs, partner cards (tier, tenants, commission, progress to next tier, payout due), "Partner invite link" | `/admin/partners` (tab next to Phase 36's Coupons) | Cards **from the template**; MRR, payout due and the statement drawer are Phase 41 (empty or disabled). **Template-style addition:** reseller create / edit modal (no template form exists). |
| Platform Security | `admin/security` (SSO, two-factor cards, IP allow-list chips + Enforce, password policy, "Save policies"); `admin/integrations` (API keys table, webhook cards, deliveries); `admin/system` Backups panel | `/admin/security`, `/admin/integrations`, `/admin/system` (backups panel only) | From the templates. "Admin sessions" and "Privacy requests" are empty (no backing table / Phase 43). SSO "Test connection" and MFA are stored only, with a "Turns on with MFA (Phase 29)" note. |

**Nav:** Billing › Dunning & Collections; Feature Management › Segments; Growth › Partners & Coupons; Operations › Security & Privacy, API & Webhooks, System Health.

## 4. Clean Architecture
`src/shared/platform/{dunning,segment,reseller,security}.ts` → `src/server/modules/platform-admin/config/*`:
- **Domain:**
  - segment matcher (pure function, shared with Phase 39's flag rules);
  - dunning day-order rule;
  - security rules (break-glass, CIDR parse, lock-out safety).
- **Application:** services in `UnitOfWork.run(adminActorContext)`.
- **Infrastructure:**
  - Prisma stores via the allow-listed `*AddUpdate` functions;
  - `SecretBox` for the IBAN and webhook secrets;
  - bcrypt / sha-256 for API keys;
  - `pg_dump` runner for backups.
- **Controllers** under `/api/admin/...` (`@AdminRoute`) → `src/features/platform-config/*` → pages.

## 5. API contracts (`@AdminRoute`)
| Method & path | Notes | Errors |
|---|---|---|
| `GET/POST/PATCH/DELETE /api/admin/dunning-policies(/:id)`, `POST /:id/activate` | Activating one deactivates the other, in one transaction | 400 day order, 409 `DUNNING_POLICY_IN_USE` |
| `GET/POST/PATCH/DELETE /api/admin/segments(/:id)`, `PUT /:id/rules`, `PUT /:id/tenants`, `POST /:id/evaluate`, `POST /api/admin/segments/preview` (unsaved rules) | Evaluate returns the matching tenants and plan breakdown | 400 operator / attribute, 409 `SEGMENT_IN_USE` (flags or broadcasts) |
| `GET/POST/PATCH/DELETE /api/admin/resellers(/:id)`, `POST /:id/status`, `POST /:id/invite-code` (regenerate) | IBAN write-only | 409 name, 409 `RESELLER_IN_USE` |
| `GET/PUT /api/admin/security/settings`; `GET/POST/DELETE /api/admin/security/allowed-ips` | **PUT is refused when it would lock out the current request:** enforcing an allow-list that doesn't contain the caller's IP → 409 `SECURITY_SELF_LOCKOUT`; at least one active range while enforced | 400 SSO pairs, 409 `SECURITY_SELF_LOCKOUT` |
| `GET/POST /api/admin/api-keys` (secret shown once), `POST /:id/rotate \| revoke` | Per tenant (tenant picker) | 409 already revoked |
| `GET/POST/PATCH/DELETE /api/admin/webhooks(/:id)`, `POST /:id/test`, `GET /:id/deliveries`, `POST /deliveries/:id/replay` | Test = a signed HTTPS POST with a 10 s timeout, recorded as a delivery | 400 url / events |
| `GET /api/admin/backups`, `POST /api/admin/backups/run` | Runs `pg_dump` (PostgreSQL 18 bin) to `BACKUP_DIR` from `.env`; records RUNNING → COMPLETED / FAILED with size and duration | 409 a backup is already running |

**Login enforcement** (`AdminAuthService`):
- the IP allow-list when enforced (break-glass: the request IP of a successful login while the list is empty never locks);
- lockout after N failed attempts for M minutes;
- password policy on admin password change.

**Defaults are applied safely:** the seeded settings row has `ipAllowlistEnforced = false` and `mfaEnforcement = OPTIONAL` until you change them.

## 6. Database: `prisma/sql/103-admin-platform-config.sql` (idempotent)
- The four function fixes above.
- A seeded security settings row with safe defaults.
- `Platform.evaluateTenantSegment(pSegmentId)` (membership, used by the API and Phase 42).
- An audit trigger on WebhookDeliveries.
- Admin failed-login counter columns on `PlatformAdmin` (`failedLoginCount`, `lockedUntil`, `lastLoginAt` written).
- Error codes listed in §5.

## 7. Audit
- **Tables covered:** all 11 tables audited.
- **Secrets:** API keys, IBAN and webhook secrets are excluded from `rowData` by the existing hide list (verified per table, extended in SQL if needed).
- **Attribution:** the Super Admin.

## 8. Ordered tasks
1. SQL 103; Prisma models; registries.
2. Contracts and services (segment matcher first, since Phase 39 reuses it).
3. Login enforcement.
4. Pages.
5. Verify.

## 9. Verification
- **Functional:**
  - **Dunning:** one active policy.
  - **Segments:**
    - rules → evaluate against the real tenants (Demo + test company);
    - include / exclude overrides;
    - the vTenant bug is fixed (a save with tenants works).
  - **Resellers:** CRUD; IBAN never returned; invite code regenerated.
  - **Security:**
    - enforcing an allow-list without your IP → 409;
    - with your IP → login from another IP is refused;
    - lockout after N wrong passwords, then unlock after M minutes;
    - password policy on change.
  - **API keys:** the secret is shown once and stored hashed; rotate grace; revoke.
  - **Webhooks:** a test delivery is recorded (to a local test receiver).
  - **Backups:** a backup run creates a file and a COMPLETED row.
  - History names the Super Admin; a tenant token is refused.
- **Visual:** `/admin/dunning` (policy panels), `/admin/segments`, `/admin/partners` resellers, `/admin/security`, `/admin/integrations`, the `/admin/system` backups panel against the templates.

## 10. Acceptance, risks, blockers
- **Risks:**
  - Security enforcement touches the admin login; the break-glass rule and safe defaults prevent lock-out.
  - `pg_dump` needs the PostgreSQL bin path and a writable `BACKUP_DIR`.
- **Blockers:** none.
