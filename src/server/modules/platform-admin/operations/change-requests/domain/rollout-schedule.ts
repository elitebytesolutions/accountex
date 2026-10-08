/** Scheduled rollout steps (Phase 43): a ramp plan whose PLANNED steps become change requests on their date. Pure. */

/** Today in Pakistan time (the platform's business day), YYYY-MM-DD. */
export const todayPk = (now = new Date()) => new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);

export type StepInput = { id?: string; stepDate: string; rolloutPct: number };

/**
 * Problems of a new step list ({ "steps.<i>.field": message }). Planned steps must be after today, each date once,
 * 0–100 %. Steps that already opened a request (`locked`) can't be moved or removed.
 */
export function scheduleErrors(steps: StepInput[], today: string, locked: { id: string; stepDate: string }[]): Record<string, string> {
  const e: Record<string, string> = {};
  const dates = new Set(locked.map((l) => l.stepDate));
  steps.forEach((s, i) => {
    const lock = s.id ? locked.find((l) => l.id === s.id) : undefined;
    if (lock) {
      if (lock.stepDate !== s.stepDate) e[`steps.${i}.stepDate`] = 'This step already opened a change request';
      return;
    }
    if (s.stepDate <= today) e[`steps.${i}.stepDate`] = 'Pick a date after today';
    if (dates.has(s.stepDate)) e[`steps.${i}.stepDate`] = 'One step per date';
    dates.add(s.stepDate);
    if (!Number.isInteger(s.rolloutPct) || s.rolloutPct < 0 || s.rolloutPct > 100) e[`steps.${i}.rolloutPct`] = '0 to 100';
  });
  return e;
}

/** A PLANNED step is due on its date (PKT). */
export const isDue = (stepDate: string, today: string) => stepDate <= today;
