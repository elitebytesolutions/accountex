import { Module } from '@nestjs/common';
import { AdminAuthService } from './application/admin-auth.service.js';
import { PlatformAdminRepository } from './domain/platform-admin.repository.js';
import { PrismaPlatformAdminRepository } from './infrastructure/prisma-platform-admin.repository.js';
import { AdminAuthController } from './presentation/admin-auth.controller.js';

/** Super Admin portal (/api/admin/*). Separate login table and token from the tenant workspace. */
@Module({
  controllers: [AdminAuthController],
  providers: [AdminAuthService, { provide: PlatformAdminRepository, useClass: PrismaPlatformAdminRepository }],
  exports: [PlatformAdminRepository],
})
export class PlatformAdminModule {}
