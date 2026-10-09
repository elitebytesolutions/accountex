import { Module } from '@nestjs/common';
import { ProfileChangeStore } from './application/profile-change-store.js';
import { ProfileChangesService } from './application/profile-changes.service.js';
import { PrismaProfileChangeStore } from './infrastructure/prisma-profile-change.store.js';
import { MyProfileController, ProfileChangeRequestsController } from './presentation/profile-changes.controller.js';

/** Phase 34 self-service requests: profile change requests (employee asks, HR approves and the value is applied). */
@Module({
  controllers: [MyProfileController, ProfileChangeRequestsController],
  providers: [ProfileChangesService, { provide: ProfileChangeStore, useClass: PrismaProfileChangeStore }],
  exports: [ProfileChangesService],
})
export class ProfileChangesModule {}
