/**
 * Section 149 salary slabs of one tax year (pure rules): sorted by start, contiguous from 0 (each slab starts where the
 * previous ends), only the last open-ended; tax = fixedTax + ratePct % of the income above excessOver (default: the
 * slab start).
 */
export type SlabIn = { incomeFrom: number; incomeTo: number | null; fixedTax: number; ratePct: number; excessOver: number | null };

export function slabRangeError(slabs: SlabIn[]): string | null {
  if (!slabs.length) return 'Add at least one slab';
  if (slabs[0]!.incomeFrom !== 0) return 'The first slab starts at 0';
  for (const [i, s] of slabs.entries()) {
    const last = i === slabs.length - 1;
    if (s.incomeTo === null && !last) return 'Only the last slab can be open-ended';
    if (s.incomeTo !== null && s.incomeTo <= s.incomeFrom) return `Slab ${i + 1} must end after it starts`;
    if (!last && slabs[i + 1]!.incomeFrom !== s.incomeTo) return `Slab ${i + 2} must start where slab ${i + 1} ends`;
    if (s.excessOver !== null && (s.excessOver < s.incomeFrom || (s.incomeTo !== null && s.excessOver > s.incomeTo))) return `Slab ${i + 1}: "excess over" must lie inside the slab`;
  }
  return null;
}

export const sortSlabs = (slabs: SlabIn[]) => [...slabs].sort((a, b) => a.incomeFrom - b.incomeFrom);
