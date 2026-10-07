/**
 * Segregation-of-duties checks for a role's grants (template Roles & Permissions `conflicts()`), driven by the
 * company's rules (Company.SegregationOfDutiesRules, seeded with the rules that used to live here).
 * Pure, so the matrix shows them live and the server checks the same ones.
 */

/** The part of a SoD rule the check needs. */
export type SodRuleRef = {
  code: string;
  name: string;
  permissionA: string;
  permissionB: string;
  description: string | null;
  severity: string;
  ownerExempt: boolean;
  isActive: boolean;
};

export type SodConflict = {
  rule: string;
  /** The permission to remove to resolve it (the rule's second permission: approve / post / edit…). */
  code: string;
  resource: string;
  action: string;
  title: string;
  detail: string;
  severity: 'WARN' | 'BLOCK';
};

/**
 * Active rules whose two permissions are both granted. The Admin role (`isAdmin`) is skipped by rules marked
 * owner-exempt and is never blocked: it always keeps every permission.
 */
export function sodConflicts(granted: Iterable<string>, rules: SodRuleRef[], isAdmin = false): SodConflict[] {
  const has = new Set(granted);
  return rules
    .filter((r) => r.isActive && has.has(r.permissionA) && has.has(r.permissionB) && !(isAdmin && r.ownerExempt))
    .map((r) => {
      const [resource = '', action = ''] = r.permissionB.split(':');
      return {
        rule: r.code, code: r.permissionB, resource, action: action.toUpperCase(), title: r.name,
        detail: r.description ?? `${r.permissionA} and ${r.permissionB} shouldn't sit with the same person.`,
        severity: r.severity === 'BLOCK' && !isAdmin ? 'BLOCK' : 'WARN',
      };
    });
}
