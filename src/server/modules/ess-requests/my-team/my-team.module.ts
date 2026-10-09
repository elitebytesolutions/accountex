import { Module } from '@nestjs/common';
import { MyTeamStore } from './application/my-team-store.js';
import { MyTeamService } from './application/my-team.service.js';
import { PrismaMyTeamStore } from './infrastructure/prisma-my-team.store.js';
import { MyTeamController } from './presentation/my-team.controller.js';

/** Phase 34: My Profile › My Team — team today and the team calendar (reports getMyTeamToday / getMyTeamCalendar). */
@Module({
  controllers: [MyTeamController],
  providers: [MyTeamService, { provide: MyTeamStore, useClass: PrismaMyTeamStore }],
})
export class MyTeamModule {}
