import { z } from 'zod';

/** One step of the Setup Guide (stepKey from the StepKey lookup). */
export const SetupStepSchema = z.object({
  key: z.string(),
  title: z.string(),
  group: z.string(),
  description: z.string(),
  tips: z.array(z.string()),
  weightPct: z.number(),
  minutes: z.number(),
  icon: z.string(),
  cta: z.string(),
  /** Workspace route of the screen that does this step, or null while that screen's phase is not built. */
  href: z.string().nullable(),
  availableInPhase: z.number().nullable(),
  done: z.boolean(),
  doneAt: z.string().nullable(),
  autoDetected: z.boolean(),
  rowVersion: z.number().int().nullable(),
});
export type SetupStep = z.infer<typeof SetupStepSchema>;

export const SetupGuideSchema = z.object({
  progressPct: z.number(),
  doneSteps: z.number(),
  totalSteps: z.number(),
  minutesRemaining: z.number(),
  nextStepKey: z.string().nullable(),
  steps: z.array(SetupStepSchema),
});
export type SetupGuide = z.infer<typeof SetupGuideSchema>;
