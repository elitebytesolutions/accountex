# Accountex

One project: a Next.js frontend and a NestJS backend that run as **one Node server on one port**.

```
src/
  app/        Next.js pages (compose feature components only)
  features/   UI features: api.ts (browser), api.server.ts (server components), components/
  lib/        API clients (lib/api) and session helpers
  shared/     Zod schemas + types used by both frontend and backend
  server/     NestJS backend and the server entry point (main.ts)
prisma/       schema (mapped from the existing DB), sql/ changes, seed
```

`src/server/main.ts` starts a single HTTP server: `/api/*` goes to NestJS, everything else to Next.js.
Next.js builds with `tsconfig.json`; the NestJS server builds with `tsconfig.server.json` into `dist/`.

## Getting started

Requires Node 24+ and the existing `accountex` PostgreSQL database (all schemas: Company, Platform, Lookups, ...).
The database is the source of truth: do not run `prisma migrate`. Changes go in `prisma/sql/*.sql`.

```bash
npm install
cp .env.example .env     # DATABASE_URL, JWT_SECRET, ADMIN_JWT_SECRET, ADMIN_* and SEED_* values
npm run db:sql           # Platform.PlatformAdmin table + SystemKey role lookups
npm run db:seed          # super admin, demo tenant with system roles, its Admin user
npm run dev              # http://localhost:3000 (workspace) and /admin (Super Admin portal)
```

## Architecture

Request path from a screen to the database:

```
features/<x>/components   form validated with the src/shared schema
features/<x>/api.ts       → lib/api/client.ts (browser) or lib/api/server.ts (server components)
── HTTP /api/* ──
middleware                request id, origin check (CSRF), helmet, rate limit
JwtAuthGuard              every route needs a session unless @Public()
ZodValidationPipe         same src/shared schema as the form
presentation/             controller: HTTP in/out only
application/              service: business logic, depends on ports only
domain/                   entity + repository interface
infrastructure/           Prisma repository (implements the interface)
```

Errors are thrown as `DomainError`s (`src/server/core/domain/errors.ts`). `DomainExceptionFilter` turns them
into `{ error: { code, message, details } }`, and the frontend turns that into an `ApiError`.

```
src/server/
  core/            domain errors, application ports (PasswordHasher, TokenService)
  infrastructure/  env config, Prisma, security adapters (bcrypt, JWT)
  common/          pipes, filters, middleware, interceptors, guards, decorators
  modules/<x>/     domain/ application/ infrastructure/ presentation/ + <x>.module.ts
```

### Adding a feature or screen

1. `src/shared/<x>/` - Zod schemas and types; export them from `src/shared/index.ts`
   (use `.ts` extensions in imports inside `src/shared`).
2. `src/server/modules/<x>/`
   - `domain/` - entity and `abstract class XRepository`
   - `application/` - `XService` using the repository interface
   - `infrastructure/` - `PrismaXRepository extends XRepository`
   - `presentation/` - controller with `@Body(new ZodValidationPipe(XSchema))`
   - `<x>.module.ts` - `{ provide: XRepository, useClass: PrismaXRepository }`, then import it in `app.module.ts`
3. `src/features/<x>/` - `api.ts` / `api.server.ts` and `components/`.
4. `src/app/(app)/<x>/page.tsx` - renders feature components. Pages under `(app)` require sign-in.

`npm run lint:arch` enforces the boundaries: the domain imports nothing from outer layers or frameworks,
application code never imports infrastructure, frontend and server code never import each other (only
`src/shared`), and pages never call `lib/api` or `fetch` directly.

## Scripts

| Command              | Description                                      |
| -------------------- | ------------------------------------------------ |
| `npm run dev`        | Start the app in development (one server, :3000) |
| `npm run build`      | Build Next.js and the NestJS server              |
| `npm start`          | Run the production build                         |
| `npm run db:up`      | Start PostgreSQL in Docker                       |
| `npm run db:sql`     | Apply the SQL in prisma/sql (idempotent)         |
| `npm run db:seed`    | Create/update admin, demo tenant, roles, user    |
| `npm run db:studio`  | Browse the database in Prisma Studio             |
| `npm run lint`       | ESLint plus architecture rules                   |

## Deploying

Any host that runs a Node process (VPS, Docker, Railway, Render, etc.):

```bash
npm ci
npm run build
npm run db:deploy
npm start
```

Set `DATABASE_URL`, `JWT_SECRET` (32+ characters) and optionally `PORT`. Serve over HTTPS: the auth
cookie is marked `Secure` in production.
