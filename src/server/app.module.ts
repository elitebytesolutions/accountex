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
import { TaxModule } from './modules/tax/tax.module.js';
import { WorkModule } from './modules/work/work.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { PartiesModule } from './modules/parties/parties.module.js';
import { HrModule } from './modules/hr/hr.module.js';
import { PayrollModule } from './modules/payroll/payroll.module.js';
import { ReceivablesModule } from './modules/receivables/receivables.module.js';
import { SalesSetupModule } from './modules/sales-setup/sales-setup.module.js';
import { DistributionModule } from './modules/distribution/distribution.module.js';
import { MeModule } from './modules/me/me.module.js';
import { HistoryModule } from './modules/history/history.module.js';
import { LookupsModule } from './modules/lookups/lookups.module.js';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module.js';
import { PlatformCatalogueModule } from './modules/platform-admin/catalogue/catalogue.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { SelfServiceModule } from './modules/self-service/self-service.module.js';
import { EssRequestsModule } from './modules/ess-requests/ess-requests.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { ApprovalsModule } from './modules/approvals/approvals.module.js';
import { LedgerModule } from './modules/ledger/ledger.module.js';
import { BankingModule } from './modules/banking/banking.module.js';
import { CashModule } from './modules/cash/cash.module.js';
import { PurchasingModule } from './modules/purchasing/purchasing.module.js';
import { SalesModule } from './modules/sales/sales.module.js';
import { WholesaleModule } from './modules/wholesale/wholesale.module.js';
import { BudgetsModule } from './modules/budgets/budgets.module.js';
import { DataOpsModule } from './modules/data-ops/data-ops.module.js';
import { CollaborationModule } from './modules/collaboration/collaboration.module.js';
import { InventoryOpsModule } from './modules/inventory-ops/inventory-ops.module.js';
import { ReceivablesOpsModule } from './modules/receivables-ops/receivables-ops.module.js';
import { DistributionOpsModule } from './modules/distribution-ops/distribution-ops.module.js';
import { PeriodCloseModule } from './modules/period-close/period-close.module.js';
import { PlatformFlagsModule } from './modules/platform-admin/flags/platform-flags.module.js';
import { WorkspaceFlagsModule } from './modules/workspace-flags/workspace-flags.module.js';
import { PlatformTemplatesModule } from './modules/platform-admin/templates/templates.module.js';
import { PlatformConfigModule } from './modules/platform-admin/config/platform-config.module.js';
import { PlatformTenantLifecycleModule } from './modules/platform-admin/tenants/tenant-lifecycle.module.js';
// Phase 42: growth & support (admin) and the workspace's Help & support / platform notices
import { PlatformGrowthModule } from './modules/platform-admin/growth/growth.module.js';
import { SupportDeskModule } from './modules/support-desk/support-desk.module.js';
// Phase 41: platform billing (invoices, payments, dunning cases, reseller payouts, daily billing job)
import { PlatformBillingModule } from './modules/platform-admin/billing/billing.module.js';
// Phase 43: platform operations (incidents + status page, flag change requests, privacy requests, entitlement log)
import { PlatformOperationsModule } from './modules/platform-admin/operations/platform-operations.module.js';

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
    PlatformCatalogueModule,
    HistoryModule,
    LookupsModule,
    SettingsModule,
    AccessModule,
    MeModule,
    FinanceModule,
    // before TreasuryModule: its generic /cash/:resource/:id/:action routes would catch Cash's own routes
    CashModule,
    TreasuryModule,
    AssetsModule,
    TaxModule,
    WorkModule,
    // before InventoryModule: its /inventory/... routes are matched first
    InventoryOpsModule,
    InventoryModule,
    PartiesModule,
    PurchasingModule,
    SalesModule,
    WholesaleModule,
    BudgetsModule,
    DataOpsModule,
    CollaborationModule,
    ReceivablesOpsModule,
    DistributionOpsModule,
    PeriodCloseModule,
    SalesSetupModule,
    DistributionModule,
    ReceivablesModule,
    HrModule,
    PayrollModule,
    SelfServiceModule,
    EssRequestsModule,
    ReportsModule,
    ApprovalsModule,
    LedgerModule,
    BankingModule,
    PlatformFlagsModule,
    WorkspaceFlagsModule,
    PlatformTemplatesModule,
    PlatformConfigModule,
    PlatformTenantLifecycleModule,
    PlatformGrowthModule,
    SupportDeskModule,
    PlatformBillingModule,
    PlatformOperationsModule,
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
