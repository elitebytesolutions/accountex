import { ConflictError } from '../../../core/domain/errors.js';

/** Throws when a code is taken: CODE_RETIRED when a deleted row used it (codes are never reused), else DB_UNIQUE_VIOLATION. */
export function assertCodeFree(codes: { code: string; deleted: boolean }[], code: string, noun: string): void {
  const hit = codes.find((c) => c.code === code);
  if (!hit) return;
  throw hit.deleted
    ? new ConflictError(`Code ${code} belonged to a deleted ${noun} and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' })
    : new ConflictError(`Code ${code} is already used.`, { code: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
}

/** Turns a field → message map into the ValidationError details shape. */
export const details = (e: Record<string, string>) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]]));
