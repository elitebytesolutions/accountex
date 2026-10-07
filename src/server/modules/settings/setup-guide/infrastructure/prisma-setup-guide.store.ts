import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { SetupGuideStore, type StepState } from '../application/setup-guide-store.js';

@Injectable()
export class PrismaSetupGuideStore extends SetupGuideStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async steps(tenantId: string): Promise<StepState[]> {
    const rows = await this.prisma.db().setupGuideSteps.findMany({
      where: { tenantId },
      select: { stepKey: true, isDone: true, doneAt: true, autoDetected: true, rowVersion: true },
    });
    return rows.map((r) => ({ ...r, doneAt: r.doneAt?.toISOString() ?? null }));
  }

  async hasProfile(tenantId: string) {
    return (await this.prisma.db().companySettings.count({ where: { tenantId } })) === 1;
  }

  async setDone(tenantId: string, stepKey: string, done: boolean, userId: string) {
    const state = done ? { isDone: true, doneAt: new Date(), doneByUserId: userId } : { isDone: false, doneAt: null, doneByUserId: null };
    await this.prisma.db().setupGuideSteps.upsert({
      where: { tenantId_stepKey: { tenantId, stepKey } },
      create: { tenantId, stepKey, ...state, autoDetected: false },
      update: { ...state, autoDetected: false },
    });
  }
}
