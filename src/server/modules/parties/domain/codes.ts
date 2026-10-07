/** The next free party code like CUST-0001 / VEN-0001: codes ever used (deleted ones included) are skipped. */
export function nextPartyCode(prefix: string, used: string[]): string {
  const taken = new Set(used);
  let n = 1;
  while (taken.has(`${prefix}-${String(n).padStart(4, '0')}`)) n++;
  return `${prefix}-${String(n).padStart(4, '0')}`;
}
