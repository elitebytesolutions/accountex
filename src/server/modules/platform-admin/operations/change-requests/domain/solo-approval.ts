/**
 * Solo approval policy (Phase 43, decision 2026-10-08). Four-eyes: the person who asked for a change does not decide it.
 * While the signed-in admin is the only active platform staff member, they may decide their own request after typing
 * the confirmation (flag key / company code) and a note; the note is stored with the "SOLO APPROVAL:" prefix so the
 * change log and history show it. The database enforces the same rule (Platform.isSoloStaff()). Pure.
 */
export const SOLO_NOTE_PREFIX = 'SOLO APPROVAL:';

export type SoloCheck =
  | { ok: true; note: string; solo: boolean }
  | { ok: false; code: 'FOUR_EYES_REQUIRED' | 'SOLO_CONFIRM_REQUIRED' | 'CR_NOTE_REQUIRED'; message: string };

export function soloDecision(p: {
  actorIsRequester: boolean; soloStaff: boolean; note: string | null | undefined; typed: string | null | undefined; expected: string; noteRequired: boolean;
}): SoloCheck {
  const note = (p.note ?? '').trim();
  if (!p.actorIsRequester) {
    if (p.noteRequired && !note) return { ok: false, code: 'CR_NOTE_REQUIRED', message: 'Add a note: what you checked before deciding.' };
    return { ok: true, note, solo: false };
  }
  if (!p.soloStaff) return { ok: false, code: 'FOUR_EYES_REQUIRED', message: 'A second platform admin must decide this. You can’t decide your own request.' };
  if (!note || (p.typed ?? '').trim().toLowerCase() !== p.expected.toLowerCase()) {
    return { ok: false, code: 'SOLO_CONFIRM_REQUIRED', message: `You are the only platform admin. Type ${p.expected} and a note to decide on your own.` };
  }
  return { ok: true, note: note.startsWith(SOLO_NOTE_PREFIX) ? note : `${SOLO_NOTE_PREFIX} ${note}`, solo: true };
}
