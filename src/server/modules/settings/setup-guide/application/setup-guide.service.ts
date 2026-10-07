import { Injectable } from '@nestjs/common';
import type { SessionUser, SetupGuide } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, NotFoundError } from '../../../../core/domain/errors.js';
import { SetupGuideStore } from './setup-guide-store.js';
import { BUILT_THROUGH_PHASE, SETUP_STEPS } from './setup-steps.js';

/** Setup Guide: progress across the onboarding steps, mark done / reopen. */
@Injectable()
export class SetupGuideService {
  constructor(
    private readonly store: SetupGuideStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async get(user: SessionUser): Promise<SetupGuide> {
    const saved = new Map((await this.store.steps(user.tenantId)).map((s) => [s.stepKey, s]));
    const steps = SETUP_STEPS.map((d) => {
      const s = saved.get(d.key);
      const built = d.phase <= BUILT_THROUGH_PHASE;
      return {
        key: d.key, title: d.title, group: d.group, description: d.description, tips: d.tips, weightPct: d.weightPct,
        minutes: d.minutes, icon: d.icon, cta: d.cta,
        href: built ? d.route : null,
        availableInPhase: built ? null : d.phase,
        done: s?.isDone ?? false,
        doneAt: s?.doneAt ?? null,
        autoDetected: s?.autoDetected ?? false,
        rowVersion: s?.rowVersion ?? null,
      };
    });
    const done = steps.filter((s) => s.done);
    const total = steps.reduce((n, s) => n + s.weightPct, 0);
    return {
      progressPct: Math.round((100 * done.reduce((n, s) => n + s.weightPct, 0)) / total),
      doneSteps: done.length,
      totalSteps: steps.length,
      minutesRemaining: steps.filter((s) => !s.done).reduce((n, s) => n + s.minutes, 0),
      nextStepKey: steps.find((s) => !s.done)?.key ?? null,
      steps,
    };
  }

  /** PROFILE follows the saved company profile; the other steps are marked by the user once the profile exists. */
  async setDone(user: SessionUser, meta: RequestMeta, stepKey: string, done: boolean): Promise<SetupGuide> {
    const key = stepKey.toUpperCase();
    if (!SETUP_STEPS.some((s) => s.key === key)) throw new NotFoundError(`Unknown setup step ${stepKey}`);
    if (key === 'PROFILE') throw new ConflictError('This step completes itself when the company profile is saved.');
    if (!(await this.store.hasProfile(user.tenantId))) {
      throw new ConflictError('Save the company profile first.', undefined, { code: 'COMPANY_PROFILE_REQUIRED' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setDone(user.tenantId, key, done, user.id));
    return this.get(user);
  }
}
