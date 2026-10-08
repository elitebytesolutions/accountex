import { Global, Module } from '@nestjs/common';
import { SessionStore } from '../../core/application/ports/session-store.js';
import { PrismaSessionStore } from './prisma-session-store.js';
import { TenantAccess } from '../../core/application/ports/tenant-access.js';
import { PrismaTenantAccess } from './prisma-tenant-access.js';

/** Server-side tenant sessions, used by the auth guard, sign-in, My Profile and user administration. */
@Global()
@Module({
  providers: [
    { provide: SessionStore, useClass: PrismaSessionStore },
    // Phase 40: company status and support-access (impersonation) checks of the auth guard
    { provide: TenantAccess, useClass: PrismaTenantAccess },
  ],
  exports: [SessionStore, TenantAccess],
})
export class SessionsModule {}
