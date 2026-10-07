# Phase 0 rev 2: Tenant-first provisioning with a locked default user (approved 2026-10-03)

## Context
**The rule:**
- The **tenant is the main record**. No user exists without a tenant (except the single super admin, who has their own table).
- Creating a tenant creates its **default user**, and that user gets **every role** automatically.
- **Locked** (your answer): the default user's roles can't be removed, they can't be deactivated or deleted, and any role the tenant gains later is auto-assigned to them.

**Verified current state:**
- `Company.Users.tenantId` is already NOT NULL. ✅
- Tenant "Demo Company" (`demo`) and user `admin@accountex.local` exist, but `prisma/seed.ts` creates them in **separate steps**: nothing ties them together, and nothing guarantees a default user.
- The default user holds only **ADMIN + EMPLOYEE** of the tenant's 10 system roles. ❌
- `Platform.Tenants` has no "default user" link.
- Default role grants live only in `prisma/catalog.ts` (TypeScript), so the database can't provision a tenant on its own.

**Goal:** one database-enforced provisioning path, used by the seed now and by the Super Admin's tenant onboarding (Phase 40) later. Demo Company is brought into line with it.

## 1. Database: `prisma/sql/006-tenant-provisioning.sql` (idempotent, added to `db:sql`)
1. **`Platform.Tenants."defaultUserId"`** (uuid, nullable only during the provisioning transaction): FK `("id", "defaultUserId")` → `Company.Users ("tenantId", "id")`, **DEFERRABLE INITIALLY DEFERRED** (tenant and user are created in the same transaction).
2. **`Platform.SystemRoleGrants`** (`systemKey` validated against the `SystemKey` lookup, `permissionCode` FK → `Company.Permissions`, PK both): the default grants per system role. It's filled from `prisma/catalog.ts` by the seed, so the database can provision a tenant by itself. It gets stamp/touch and audit triggers.
3. **`Platform.provisionTenant(pCode, pName, pLegalName, pAdminEmail, pAdminName, pPasswordHash) RETURNS uuid`**, all in one transaction:
   1. insert the tenant (`ACTIVE`);
   2. create one role per active `SystemKey` lookup (`isSystem`), with grants from `SystemRoleGrants`;
   3. insert the default user (`ACTIVE`; the existing trigger adds EMPLOYEE);
   4. set `defaultUserId`;
   5. assign **all** roles to the default user (ADMIN as primary).

   It fails as a whole if anything fails, e.g. a duplicate code gives 409 `DB_UNIQUE_VIOLATION`.
4. **Always all roles:**
   - `AFTER INSERT ON Company.Roles`: any new role (system or custom) is assigned to the tenant's default user.
   - `AFTER UPDATE OF "defaultUserId" ON Platform.Tenants`: a newly appointed default user receives all roles. Changing `defaultUserId` is the only way to hand the lock to someone else.
5. **Locks** (each raises `HINT = 'TENANT_DEFAULT_USER_LOCKED'` → 409):
   - `BEFORE DELETE ON Company.UserRoles`: a role can't be removed from the default user;
   - `BEFORE UPDATE ON Company.Users`: the default user's status can't leave `ACTIVE` and `deletedAt` can't be set;
   - `BEFORE DELETE ON Company.Users`: the default user can't be deleted;
   - `BEFORE UPDATE ON Platform.Tenants`: `defaultUserId` can't be set back to NULL.
6. **Error code:** `TENANT_DEFAULT_USER_LOCKED` (409, BUSINESS_RULE, "The company's default user always keeps every role and stays active.").
7. **Backfill Demo Company:** set `defaultUserId` = `admin@accountex.local`; the trigger in 1.4 gives them all 10 roles.

## 2. Seed and catalogue
- **`prisma/seed.ts`:**
  - syncs `SYSTEM_ROLE_GRANTS` (catalog.ts) into `Platform.SystemRoleGrants`;
  - **creates the demo tenant only through `Platform.provisionTenant`** (tenant first → roles → default user with all roles). If it already exists, it only updates names and passwords and re-syncs system-role grants (as today);
  - all statements run with `app.actorLabel = 'seed.ts'`, so their history reads `system: seed.ts`.
- **`.env` keys are unchanged.** `SEED_USER_*` becomes the tenant's default user.

## 3. Roadmap and skill
- Phase 0 tasks gain "Tenant-first provisioning: `Platform.provisionTenant`, locked default user with all roles".
- Phase 37 "Tenant Seed Templates" adds `Platform.SystemRoleGrants`.
- Phase 40 "Tenants": onboarding **must call `Platform.provisionTenant`**; the onboarding form asks for the default user's name, email and password.
- Skill `next-phase` rule: never insert `Company.Users` without a tenant, and never bypass `provisionTenant` for new tenants.
- `npm run delivery:roadmap` must pass.

## 4. App code
- None required. Login, session and permissions already read roles from the database, so the default user's permissions become the union of all 10 roles. My Profile shows all role names.

## Verification
- **Provisioning, in a rolled-back transaction:** `provisionTenant('acme', …)` →
  - the tenant has 10 system roles with grants matching `SystemRoleGrants`;
  - the default user is ACTIVE with **10 roles** (ADMIN primary) and `defaultUserId` is set;
  - the audit rows show `system: <label>`.
- **New role:** adding a custom role → it's auto-assigned to the default user.
- **Locks, each giving 409 `TENANT_DEFAULT_USER_LOCKED`:** removing a role from the default user; setting them to SUSPENDED; soft-deleting them; hard-deleting them; nulling `defaultUserId`. A **non-default** user can still lose roles and be suspended.
- **Tenant required:** inserting a user without `tenantId` fails (NOT NULL).
- **Duplicate code:** provisioning an existing code → whole provisioning rolls back, nothing left behind.
- **Demo Company after `npm run db:sql && npm run db:seed`:** `admin@accountex.local` holds 10 roles; login works; `/api/auth/me` lists 10 roles; History shows the role assignments.
- Typecheck, lint, roadmap check; the SQL runs twice cleanly.
- Phase 0 stays `in-progress` until you accept revision 2.
