import { ConflictError, ValidationError } from '../../../core/domain/errors.js';

/** Announcements: only drafts are edited; published ones are archived (the table has no deletedAt). */
export function assertAnnouncementDraft(status: string): void {
  if (status !== 'DRAFT') {
    throw new ConflictError('Only draft announcements can be edited. Published ones can only be archived.', undefined, { code: 'ANNOUNCEMENT_NOT_DRAFT' });
  }
}

/** Publishing: from DRAFT only, with any expiry after the publish moment. */
export function assertPublishable(status: string, publishedAt: Date, expiresAt: Date | null): void {
  assertAnnouncementDraft(status);
  if (expiresAt && expiresAt.getTime() <= publishedAt.getTime()) {
    throw new ValidationError('The expiry must be after the publish time', { expiresAt: ['Expires before it is published'] });
  }
}

/** Polls and pulse surveys: edits and deletes only while DRAFT. */
export function assertEngagementDraft(status: string, noun: 'poll' | 'survey'): void {
  if (status !== 'DRAFT') {
    throw new ConflictError(`Only draft ${noun}s can be edited or deleted. Close it instead.`, undefined, { code: 'POLL_NOT_DRAFT' });
  }
}

/** DRAFT → OPEN → CLOSED, never back. */
export function nextEngagementStatus(current: string, action: 'open' | 'close'): string {
  if (action === 'open' && current === 'DRAFT') return 'OPEN';
  if (action === 'close' && current === 'OPEN') return 'CLOSED';
  throw new ConflictError(action === 'open' ? 'Only a draft can be opened.' : 'Only an open poll or survey can be closed.', { status: [`Currently ${current.toLowerCase()}`] });
}

/**
 * Child rows (poll options, survey questions) for a save function that deletes rows missing from the array, updates
 * rows sent with an id and inserts the rest. Rows are numbered 1..n in order; a row keeps its id only when it keeps
 * its number, so no update ever collides with another row's (tenantId, parentId, seq) key.
 */
export function syncSeqRows<T extends { id?: string }>(existing: { id: string; seq: number }[], desired: T[]): (Omit<T, 'id'> & { id?: string; seq: number })[] {
  const seqOf = new Map(existing.map((r) => [r.id, r.seq]));
  return desired.map((row, i) => {
    const { id, ...rest } = row;
    const seq = i + 1;
    return id && seqOf.get(id) === seq ? { ...rest, id, seq } : { ...rest, seq };
  });
}
