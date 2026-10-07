import { Global, Module } from '@nestjs/common';
import { SessionStore } from '../../core/application/ports/session-store.js';
import { PrismaSessionStore } from './prisma-session-store.js';

/** Server-side tenant sessions, used by the auth guard, sign-in, My Profile and user administration. */
@Global()
@Module({
  providers: [{ provide: SessionStore, useClass: PrismaSessionStore }],
  exports: [SessionStore],
})
export class SessionsModule {}
