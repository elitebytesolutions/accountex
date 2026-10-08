import { Module } from '@nestjs/common';
import { PlatformFlagsModule } from '../platform-admin/flags/platform-flags.module.js';
import { MyFlagsController } from './presentation/my-flags.controller.js';

/** Phase 39: feature flags for the tenant workspace (GET /api/me/flags), evaluated per request. */
@Module({
  imports: [PlatformFlagsModule],
  controllers: [MyFlagsController],
})
export class WorkspaceFlagsModule {}
