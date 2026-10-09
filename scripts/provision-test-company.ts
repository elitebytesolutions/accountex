/**
 * Provisions "Test Co" (code `test`), the company the API test suites post into from Phase 16 on. Posted vouchers,
 * approval actions and other append-only records can never be deleted, so tests keep them out of the Demo company.
 * Created only through Platform.provisionTenant (tenant → system roles → default user with every role), like Demo.
 * Reads TEST_TENANT_CODE (default "test"), TEST_USER_EMAIL and TEST_USER_PASSWORD from .env; when the password is
 * missing it generates one and appends it to .env (never printed). Safe to run again: an existing company is left as is.
 * Run: npx tsx scripts/provision-test-company.ts
 */
import { appendFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { PrismaClient } from '../src/server/generated/prisma/client.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL in .env');
const code = process.env.TEST_TENANT_CODE ?? 'test';
const email = (process.env.TEST_USER_EMAIL ?? 'admin@test.accountex.local').trim().toLowerCase();
let password = process.env.TEST_USER_PASSWORD;
if (!password) {
  password = randomBytes(12).toString('base64url');
  appendFileSync('.env', `\n# Test Co (API test suites; scripts/provision-test-company.ts)\nTEST_TENANT_CODE="${code}"\nTEST_USER_EMAIL="${email}"\nTEST_USER_PASSWORD="${password}"\n`);
  console.log('Generated TEST_USER_PASSWORD and saved it to .env');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, options: '-c TimeZone=UTC' }) });
try {
  const existing = await prisma.tenants.findUnique({ where: { code } });
  if (existing) {
    console.log(`Company "${code}" already exists; nothing to do.`);
  } else {
    const passwordHash = await hash(password, 12);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select set_config('app.actorLabel', 'provision-test-company', true)`;
      await tx.$queryRaw`select "Platform"."provisionTenant"(${code}, ${'Test Co'}, ${'Test Co (API tests)'}, ${email}, ${'Test Admin'}, ${passwordHash})`;
    });
    console.log(`Provisioned "${code}" (Test Co) with its default user ${email}`);
  }
} finally {
  await prisma.$disconnect();
}
