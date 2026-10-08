/**
 * Impact of an entitlement change (Phase 43; template changeImpact()): tenants on the plan (or with the add-on) are
 * affected; gaining a feature or headroom is a GAIN, losing one or paying more is a LOSS. Pure.
 */
export type ImpactTone = 'GAIN' | 'LOSS' | 'NEUTRAL';

export function featureTone(from: boolean, to: boolean): ImpactTone {
  return from === to ? 'NEUTRAL' : to ? 'GAIN' : 'LOSS';
}

/** null = unlimited. */
export function limitTone(from: number | null, to: number | null): ImpactTone {
  if (from === to) return 'NEUTRAL';
  if (to === null) return 'GAIN';
  if (from === null) return 'LOSS';
  return to > from ? 'GAIN' : 'LOSS';
}

/** The customer's view: a higher price is a loss. */
export function priceTone(from: number, to: number): ImpactTone {
  return from === to ? 'NEUTRAL' : to > from ? 'LOSS' : 'GAIN';
}
