/**
 * Seeds the single platform admin and one demo tenant. Tenants are created only through Platform.provisionTenant:
 * tenant → system roles + default grants → default user holding every role (locked by DB triggers).
 * Run the SQL in prisma/sql first (npm run db:sql). There are no registration screens.
 * Reads from the .env file:
 *   ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD               - Super Admin portal (/admin)
 *   SEED_TENANT_NAME, SEED_TENANT_CODE                    - demo tenant (code is also its subdomain)
 *   SEED_USER_EMAIL, SEED_USER_NAME, SEED_USER_PASSWORD   - that tenant's default user (all roles)
 */
import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { PrismaClient } from '../src/server/generated/prisma/client.js';
import { SYSTEM_ROLE_GRANTS } from './catalog.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const required = [
  'DATABASE_URL',
  'ADMIN_EMAIL',
  'ADMIN_NAME',
  'ADMIN_PASSWORD',
  'SEED_TENANT_NAME',
  'SEED_TENANT_CODE',
  'SEED_USER_EMAIL',
  'SEED_USER_NAME',
  'SEED_USER_PASSWORD',
] as const;
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Set ${missing.join(', ')} in .env`);
const env = Object.fromEntries(required.map((key) => [key, process.env[key]!])) as Record<
  (typeof required)[number],
  string
>;
for (const key of ['ADMIN_PASSWORD', 'SEED_USER_PASSWORD'] as const) {
  if (env[key].length < 8) throw new Error(`${key} must be at least 8 characters`);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL, options: '-c TimeZone=UTC' }) });
const adminEmail = env.ADMIN_EMAIL.trim().toLowerCase();
const adminHash = await hash(env.ADMIN_PASSWORD, 12);
const code = env.SEED_TENANT_CODE.trim().toLowerCase();
const userEmail = env.SEED_USER_EMAIL.trim().toLowerCase();
const userHash = await hash(env.SEED_USER_PASSWORD, 12);

// One transaction, authored as "system: seed.ts" in the row history.
await prisma.$transaction(
  async (tx) => {
    await tx.$executeRaw`select set_config('app.actorLabel', 'seed.ts', true)`;

    // --- Platform admin (exactly one row, enforced by the unique `singleton` column) ---
    const admin = { email: adminEmail, fullName: env.ADMIN_NAME, passwordHash: adminHash };
    await tx.platformAdmin.upsert({ where: { singleton: true }, update: admin, create: admin });
    console.log(`Seeded platform admin ${adminEmail}`);

    // --- Default grants per system role (prisma/catalog.ts → Platform.SystemRoleGrants), applied by difference ---
    const permissions = await tx.permissions.findMany({ select: { code: true, resource: true, action: true } });
    const grantRows = Object.entries(SYSTEM_ROLE_GRANTS).flatMap(([systemKey, grants]) => {
      const g: Record<string, string[]> = grants;
      return permissions
        .filter((p) => (g['*'] ?? g[p.resource] ?? []).includes(p.action.toLowerCase()))
        .map((p) => ({ systemKey, permissionCode: p.code }));
    });
    const keys = grantRows.map((r) => `${r.systemKey}|${r.permissionCode}`);
    await tx.$executeRaw`
      delete from "Platform"."SystemRoleGrants"
      where not ("systemKey" || '|' || "permissionCode" = any(${keys}::text[]))`;
    await tx.$executeRaw`
      insert into "Platform"."SystemRoleGrants" ("systemKey", "permissionCode")
      select split_part(k, '|', 1), split_part(k, '|', 2) from unnest(${keys}::text[]) as k
      on conflict do nothing`;
    for (const key of Object.keys(SYSTEM_ROLE_GRANTS)) {
      console.log(`  ${key.padEnd(20)} ${grantRows.filter((r) => r.systemKey === key).length} permissions`);
    }

    // --- Demo tenant: created only through provisionTenant ----------------------
    let tenant = await tx.tenants.findUnique({ where: { code } });
    if (!tenant) {
      await tx.$queryRaw`select "Platform"."provisionTenant"(${code}, ${env.SEED_TENANT_NAME}, ${env.SEED_TENANT_NAME}, ${userEmail}, ${env.SEED_USER_NAME}, ${userHash})`;
      tenant = await tx.tenants.findUniqueOrThrow({ where: { code } });
      console.log(`Provisioned tenant ${code} with its default user ${userEmail}`);
    } else {
      await tx.tenants.update({ where: { id: tenant.id }, data: { displayName: env.SEED_TENANT_NAME, legalName: env.SEED_TENANT_NAME } });
      // System roles for any SystemKey added since provisioning (each new role goes to the default user by trigger).
      await tx.$executeRaw`
        insert into "Company"."Roles" ("tenantId", "systemKey", "name", "description", "isSystem")
        select ${tenant.id}::uuid, l."code", l."label", l."description", true from "Lookups"."Lookups" l
        where l."lookupType" = 'SystemKey' and l."tenantId" is null and l."isActive"
          and not exists (select 1 from "Company"."Roles" r where r."tenantId" = ${tenant.id}::uuid and r."systemKey" = l."code")`;
      // System role grants follow Platform.SystemRoleGrants (by difference, so unchanged grants leave no history).
      await tx.$executeRaw`
        delete from "Company"."RolePermissions" rp using "Company"."Roles" r
        where rp."roleId" = r."id" and r."tenantId" = ${tenant.id}::uuid and r."isSystem"
          and not exists (select 1 from "Platform"."SystemRoleGrants" g where g."systemKey" = r."systemKey" and g."permissionCode" = rp."permissionCode")`;
      await tx.$executeRaw`
        insert into "Company"."RolePermissions" ("tenantId", "roleId", "permissionCode")
        select ${tenant.id}::uuid, r."id", g."permissionCode" from "Company"."Roles" r
        join "Platform"."SystemRoleGrants" g on g."systemKey" = r."systemKey"
        where r."tenantId" = ${tenant.id}::uuid and r."isSystem"
        on conflict ("tenantId", "roleId", "permissionCode") do nothing`;
      console.log(`Updated tenant ${code}`);
    }

    // --- Default user: name and password from .env -----------------------------
    if (!tenant.defaultUserId) throw new Error(`Tenant ${code} has no default user`);
    const user = await tx.users.update({
      where: { id: tenant.defaultUserId },
      data: { email: userEmail, fullName: env.SEED_USER_NAME, passwordHash: userHash },
      select: { email: true, UserRoles: { where: { Roles: { deletedAt: null } }, select: { Roles: { select: { systemKey: true, name: true } } } } },
    });
    console.log(`Default user ${user.email} holds ${user.UserRoles.length} roles: ${user.UserRoles.map((r) => r.Roles.systemKey ?? r.Roles.name).join(', ')}`);
  },
  { timeout: 60_000 },
);

await prisma.$disconnect();
