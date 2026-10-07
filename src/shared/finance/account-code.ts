/**
 * Chart-of-accounts code rules (same as Accounting.getAccountLevel / getParentAccountCode and the account checks):
 * X000 = level 1 (class header), XY00 = level 2 (header), XYZW = level 3 (group), XYZW-NN = level 4 (postable).
 * The first digit is the class: 1 assets, 2 liabilities, 3 equity, 4 revenue, 5 expenses.
 */
export const ACCOUNT_CODE_RE = /^[1-5][0-9]{3}(-[0-9]{2,3})?$/;

export const ACCOUNT_CLASSES = [
  { cls: 1, name: 'Assets', nature: 'DR' },
  { cls: 2, name: 'Liabilities', nature: 'CR' },
  { cls: 3, name: 'Equity', nature: 'CR' },
  { cls: 4, name: 'Revenue', nature: 'CR' },
  { cls: 5, name: 'Expenses', nature: 'DR' },
] as const;

export function accountLevel(code: string): 1 | 2 | 3 | 4 {
  if (code.includes('-')) return 4;
  if (code.slice(1) === '000') return 1;
  if (code.slice(2) === '00') return 2;
  return 3;
}

export const accountClassOf = (code: string) => Number(code[0]);
export const accountKindOf = (level: number) => (level <= 2 ? 'HEADER' : level === 3 ? 'GROUP' : 'POSTABLE');

export function parentAccountCode(code: string): string | null {
  switch (accountLevel(code)) {
    case 1: return null;
    case 2: return `${code[0]}000`;
    case 3: return `${code.slice(0, 2)}00`;
    default: return code.split('-')[0]!;
  }
}

/** Whether `code` is a direct child code of `parent` (the rule the database enforces on insert). */
export const isChildCode = (code: string, parent: string) =>
  ACCOUNT_CODE_RE.test(code) && parentAccountCode(code) === parent && accountLevel(code) === accountLevel(parent) + 1;

/** The next free child code under `parent`, or null when the range is full. */
export function nextChildCode(parent: string, taken: Iterable<string>): string | null {
  const used = new Set(taken);
  const level = accountLevel(parent);
  const candidates: string[] = [];
  if (level === 1) for (let d = 1; d <= 9; d++) candidates.push(`${parent[0]}${d}00`);
  else if (level === 2) for (let n = 10; n <= 99; n += 10) candidates.push(`${parent.slice(0, 2)}${n}`);
  else if (level === 3) for (let n = 1; n <= 99; n++) candidates.push(`${parent}-${String(n).padStart(2, '0')}`);
  if (level === 2) for (let n = 1; n <= 99; n++) if (n % 10) candidates.push(`${parent.slice(0, 2)}${String(n).padStart(2, '0')}`);
  return candidates.find((c) => !used.has(c)) ?? null;
}
