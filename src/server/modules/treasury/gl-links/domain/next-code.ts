/**
 * Next code for a new bank or cash GL account under a group (XYZW): the first free XYZW-NN after the last
 * account of the same sub-type, so banks stay together (1110-10, -11 …) and cash accounts together (1110-01 …).
 * Falls back to the first free number. `taken` includes the codes of deleted accounts (codes are never reused).
 */
export function nextLinkedCode(group: string, children: { code: string; subType: string | null }[], subType: string, taken: Set<string>): string | null {
  const num = (code: string) => Number(code.split('-')[1]);
  const last = Math.max(0, ...children.filter((c) => c.subType === subType).map((c) => num(c.code)));
  const code = (n: number) => `${group}-${String(n).padStart(2, '0')}`;
  for (let n = last + 1; n <= 99; n++) if (!taken.has(code(n))) return code(n);
  for (let n = 1; n <= 99; n++) if (!taken.has(code(n))) return code(n);
  return null;
}
