import { Module } from '@nestjs/common';
import { PolicyAckStore } from './application/policy-ack-store.js';
import { PolicyAcksService } from './application/policy-acks.service.js';
import { PrismaPolicyAckStore } from './infrastructure/prisma-policy-ack.store.js';
import { MyPoliciesController, PolicyAcknowledgementsController } from './presentation/policy-acks.controller.js';

/** Phase 34 self-service requests: policy acknowledgements (employees sign published policy versions; HR and managers follow up). */
@Module({
  controllers: [MyPoliciesController, PolicyAcknowledgementsController],
  providers: [PolicyAcksService, { provide: PolicyAckStore, useClass: PrismaPolicyAckStore }],
})
export class PolicyAcksModule {}
