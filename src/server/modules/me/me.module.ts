import { Module } from '@nestjs/common';
import { MeStore } from './application/me-store.js';
import { MeService } from './application/me.service.js';
import { PrismaMeStore } from './infrastructure/prisma-me.store.js';
import { MeController } from './presentation/me.controller.js';

/** The signed-in user's own account: profile, password, devices, preferences. */
@Module({
  controllers: [MeController],
  providers: [MeService, { provide: MeStore, useClass: PrismaMeStore }],
})
export class MeModule {}
