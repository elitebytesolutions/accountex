import { Module } from '@nestjs/common';
import { HrModule } from '../../hr/hr.module.js';
import { LetterRequestStore } from './application/letter-request-store.js';
import { LetterRequestsService } from './application/letter-requests.service.js';
import { PrismaLetterRequestStore } from './infrastructure/prisma-letter-request.store.js';
import { LetterRequestsController, MyLetterRequestsController } from './presentation/letter-requests.controller.js';

/** Phase 34 self-service requests: letter requests (issued as Phase 33 employee letters, from HrModule). */
@Module({
  imports: [HrModule],
  controllers: [MyLetterRequestsController, LetterRequestsController],
  providers: [LetterRequestsService, { provide: LetterRequestStore, useClass: PrismaLetterRequestStore }],
})
export class LetterRequestsModule {}
