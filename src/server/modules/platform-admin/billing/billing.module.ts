import { Module } from '@nestjs/common';
import { PlatformAdminModule } from '../platform-admin.module.js';
import { TenantStore } from '../tenants/tenants/application/tenant-store.js';
import { PrismaTenantStore } from '../tenants/tenants/infrastructure/prisma-tenant.store.js';
import { DunningStore } from './dunning/application/dunning-store.js';
import { DunningService } from './dunning/application/dunning.service.js';
import { PrismaDunningStore } from './dunning/infrastructure/prisma-dunning.store.js';
import { DunningController } from './dunning/presentation/dunning.controller.js';
import { InvoiceStore } from './invoices/application/invoice-store.js';
import { InvoicesService } from './invoices/application/invoices.service.js';
import { PrismaInvoiceStore } from './invoices/infrastructure/prisma-invoice.store.js';
import { InvoicesController } from './invoices/presentation/invoices.controller.js';
import { PaymentStore } from './payments/application/payment-store.js';
import { PaymentsService } from './payments/application/payments.service.js';
import { PrismaPaymentStore } from './payments/infrastructure/prisma-payment.store.js';
import { PaymentsController } from './payments/presentation/payments.controller.js';
import { PayoutStore } from './payouts/application/payout-store.js';
import { PayoutsService } from './payouts/application/payouts.service.js';
import { PrismaPayoutStore } from './payouts/infrastructure/prisma-payout.store.js';
import { PayoutsController, ResellerAttributionController } from './payouts/presentation/payouts.controller.js';
import { BillingJob } from './run/application/billing-job.js';
import { BillingRunController } from './run/presentation/billing-run.controller.js';

/**
 * Phase 41: platform billing under /api/admin: invoices (+ payments), dunning cases, reseller payouts and attribution,
 * and the daily billing job (BILLING_JOB=off disables its timer). Company session revocation on suspension reuses the
 * Phase 40 tenant store (Platform.Tenants / UserSessions).
 */
@Module({
  imports: [PlatformAdminModule],
  controllers: [InvoicesController, PaymentsController, DunningController, BillingRunController, PayoutsController, ResellerAttributionController],
  providers: [
    InvoicesService, { provide: InvoiceStore, useClass: PrismaInvoiceStore },
    PaymentsService, { provide: PaymentStore, useClass: PrismaPaymentStore },
    DunningService, { provide: DunningStore, useClass: PrismaDunningStore },
    PayoutsService, { provide: PayoutStore, useClass: PrismaPayoutStore },
    { provide: TenantStore, useClass: PrismaTenantStore },
    BillingJob,
  ],
})
export class PlatformBillingModule {}
