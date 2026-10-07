import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { PermissionGuard } from './common/guards/permission.guard.js';
import { ThrottlerBySessionGuard } from './common/guards/throttler-by-session.guard.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { OriginCheckMiddleware } from './common/middleware/origin-check.middleware.js';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { ErrorsModule } from './infrastructure/errors/errors.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { SecurityModule } from './infrastructure/security/security.module.js';
import { SessionsModule } from './infrastructure/sessions/sessions.module.js';
import { AccessModule } from './modules/access/access.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';
import { TreasuryModule } from './modules/treasury/treasury.module.js';
import { AssetsModule } from './modules/assets/assets.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { PartiesModule } from './modules/parties/parties.module.js';
import { HrModule } from './modules/hr/hr.module.js';
import { ReceivablesModule } from './modules/receivables/receivables.module.js';
import { SalesSetupModule } from './modules/sales-setup/sales-setup.module.js';
import { MeModule } from './modules/me/me.module.js';
import { HistoryModule } from './modules/history/history.module.js';
import { LookupsModule } from './modules/lookups/lookups.module.js';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    // Per session (ThrottlerBySessionGuard). Each page load makes a session check, so this must allow fast browsing;
    // sign-in keeps its own strict limit (5/min, AuthController).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    PrismaModule,
    ErrorsModule,
    SecurityModule,
    SessionsModule,
    UsersModule,
    AuthModule,
    PlatformAdminModule,
    HistoryModule,
    LookupsModule,
    SettingsModule,
    AccessModule,
    MeModule,
    FinanceModule,
    TreasuryModule,
    AssetsModule,
    InventoryModule,
    PartiesModule,
    SalesSetupModule,
    ReceivablesModule,
    HrModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    // Guards run in this order: rate limit, authentication, then @RequirePermission.
    { provide: APP_GUARD, useClass: ThrottlerBySessionGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, OriginCheckMiddleware).forRoutes('*path');
  }
}
