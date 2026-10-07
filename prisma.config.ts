import { existsSync } from 'node:fs';
import { defineConfig, env } from 'prisma/config';

// The .env lives at the project root.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
