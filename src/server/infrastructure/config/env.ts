import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// The .env lives at the project root (src/server/... and dist/server/... are both 4 levels down).
const envFile = resolve(import.meta.dirname, '../../../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  // Super Admin portal (/admin): its own secret so tenant and admin tokens can never be swapped.
  ADMIN_JWT_SECRET: z.string().min(32, 'ADMIN_JWT_SECRET must be at least 32 characters'),
  ADMIN_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 12),
  // AES-256-GCM key (base64, 32 bytes) for tenant secrets such as FBR/PRA API tokens. Losing it makes them unreadable.
  APP_ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'APP_ENCRYPTION_KEY must be 32 bytes, base64-encoded'),
  // Phase 38: on-demand backups (Super Admin › System Health). A relative BACKUP_DIR is under the project root.
  BACKUP_DIR: z.string().min(1).default('./backups'),
  // Phase 32: uploaded files (Company.Attachments rows point here). A relative UPLOAD_DIR is under the project root.
  UPLOAD_DIR: z.string().min(1).default('./uploads'),
  PG_DUMP_PATH: z.string().min(1).default(process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe' : 'pg_dump'),
  // Phase 28: FBR / PRA Digital Invoicing. Sending is per company (FbrSettings.sendingEnabled, off by default).
  // FBR_SIMULATE_TENANTS: comma-separated company codes that use a local simulator instead of FBR (tests only); the
  // simulator's invoice numbers start with "SIM-".
  FBR_DI_URL_PRODUCTION: z.url().default('https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata'),
  FBR_DI_URL_SANDBOX: z.url().default('https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata_sb'),
  FBR_REFERENCE_URL: z.url().default('https://gw.fbr.gov.pk/pdi/v1/provinces'),
  FBR_SIMULATE_TENANTS: z.string().default('').transform((v) => v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
}

/** Validated, typed environment. Import this instead of reading process.env. */
export const env = parsed.data;
