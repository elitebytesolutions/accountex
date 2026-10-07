import { NUMERIC_CONDITION_FIELDS } from './approval-workflow.ts';

type Scalar = number | string;
export type ConditionInput = { seq: number; field: string; operator: string; value: unknown };
export type ConditionResult = { seq: number; passed: boolean; reason: string };

const isNumeric = (field: string) => (NUMERIC_CONDITION_FIELDS as readonly string[]).includes(field);

/**
 * Whether a document matches a workflow's conditions (all must hold). Pure: used by the dry-run and,
 * from the transactions phases on, by approval routing.
 */
export function evaluateConditions(conditions: ConditionInput[], doc: Record<string, Scalar>): { matches: boolean; results: ConditionResult[] } {
  const results = conditions.map((c): ConditionResult => {
    const raw = doc[c.field];
    if (raw === undefined || raw === '') return { seq: c.seq, passed: false, reason: `No ${c.field.toLowerCase().replace(/_/g, ' ')} given` };
    const norm = (v: unknown): Scalar => (isNumeric(c.field) ? Number(v) : String(v).toUpperCase());
    const actual = norm(raw);
    const list = (Array.isArray(c.value) ? c.value : [c.value]).map(norm);
    const [first, second] = list as [Scalar, Scalar | undefined];
    let passed: boolean;
    switch (c.operator) {
      case 'GT': passed = actual > first; break;
      case 'GTE': passed = actual >= first; break;
      case 'LT': passed = actual < first; break;
      case 'LTE': passed = actual <= first; break;
      case 'EQ': passed = actual === first; break;
      case 'NEQ': passed = actual !== first; break;
      case 'IN': passed = list.includes(actual); break;
      case 'NOT_IN': passed = !list.includes(actual); break;
      case 'BETWEEN': passed = second !== undefined && actual >= first && actual <= second; break;
      default: passed = false;
    }
    return { seq: c.seq, passed, reason: `${raw} ${c.operator.toLowerCase().replace('_', ' ')} ${list.join(' – ')}` };
  });
  return { matches: results.every((r) => r.passed), results };
}

/** A stable key of a condition set, to find two active workflows that would route the same documents. */
export const conditionsKey = (conditions: { field: string; operator: string; value: unknown }[]) =>
  JSON.stringify(
    conditions
      .map((c) => ({ f: c.field, o: c.operator, v: Array.isArray(c.value) ? [...c.value].map(String).sort() : String(c.value) }))
      .sort((a, b) => (a.f + a.o).localeCompare(b.f + b.o)),
  );
