/**
 * The approval engine's pure rules (no framework, no database): which workflow routes a document, which of its steps
 * apply to an amount, and when a step is complete.
 */
export type EngineCondition = { seq: number; field: string; operator: string; value: unknown };
export type EngineStep = {
  id: string; stepNo: number; name: string; approverType: string; approverRoleId: string | null; approverUserId: string | null;
  appliesAboveAmount: number | null; slaHours: number | null; approvalMode: string; blockSelfApproval: boolean; allowDelegation: boolean; requireComment: boolean;
};
export type EngineWorkflow = { id: string; name: string; priority: number; onComplete: string; onReject: string; conditions: EngineCondition[]; steps: EngineStep[] };
export type EngineAction = { stepNo: number; action: string; actorUserId: string | null; onBehalfOfUserId: string | null; delegateToUserId: string | null; actedAt: Date };

/** Steps that apply to this amount, in order (a step with a threshold applies only above it). */
export const applicableSteps = (wf: EngineWorkflow, amount: number) =>
  [...wf.steps].sort((a, b) => a.stepNo - b.stepNo).filter((s) => s.appliesAboveAmount === null || amount > s.appliesAboveAmount);

/** The first matching active workflow, lowest priority number first (then name), that has a step for this amount. */
export function pickWorkflow(workflows: EngineWorkflow[], matches: (wf: EngineWorkflow) => boolean, amount: number): EngineWorkflow | null {
  return [...workflows].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name)).find((w) => matches(w) && applicableSteps(w, amount).length > 0) ?? null;
}

/** Actions since the request was last (re)submitted: earlier rounds don't count towards the current one. */
export function currentRound<T extends EngineAction>(actions: T[]): T[] {
  const sorted = [...actions].sort((a, b) => a.actedAt.getTime() - b.actedAt.getTime());
  const start = sorted.reduce((k, a, i) => (a.action === 'SUBMIT' || a.action === 'RESUBMIT' ? i : k), -1);
  return start < 0 ? sorted : sorted.slice(start + 1);
}

/** Who has approved a step in this round (an approval on behalf of someone counts as theirs). */
export const approvedBy = (round: EngineAction[], stepNo: number) =>
  new Set(round.filter((a) => a.stepNo === stepNo && a.action === 'APPROVE').map((a) => a.onBehalfOfUserId ?? a.actorUserId).filter((x): x is string => !!x));

/** ANY: one approval completes the step. ALL: every approver of the step (the requester never counts) has approved. */
export function stepComplete(step: EngineStep, approvers: string[], approved: Set<string>, requesterUserId: string): boolean {
  if (step.approvalMode !== 'ALL') return approved.size > 0;
  const needed = approvers.filter((u) => u !== requesterUserId);
  return needed.length > 0 && needed.every((u) => approved.has(u));
}
