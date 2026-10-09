import { Injectable } from '@nestjs/common';

/**
 * A document type that routes through approvals (vouchers now; bills, payments, leave… in later phases). Each module
 * registers one on start-up; the engine calls it inside the same transaction as the approval action.
 */
export interface ApprovalSubject {
  /** The document types it covers (Approvals.entityType references Company.DocumentTypes), e.g. JV, CPV, BPV. */
  entityTypes: string[];
  /** ApprovalWorkflows.subject the workflows are defined for. */
  workflowSubject: string;
  /** App route of the document. */
  link(entityId: string): string;
  /** The document's lines for the inbox drawer. */
  lines(tenantId: string, entityId: string): Promise<{ account: string; particulars: string | null; debit: number; credit: number }[]>;
  /** Final approval: mark approved, and post when the workflow says Auto-post. */
  onApproved(tenantId: string, entityId: string, approverUserId: string, autoPost: boolean): Promise<void>;
  /** Rejected or sent back for changes: the document returns to its preparer as a draft. */
  onReturned(tenantId: string, entityId: string, action: 'REJECT' | 'REQUEST_CHANGES', reason: string | null, actorUserId?: string | null): Promise<void>;
  /** A comment on the document's own activity log, by the commenting user. */
  onComment?(tenantId: string, entityId: string, userId: string, comment: string): Promise<void>;
  /**
   * The request moved to a step (on submit, and after each completed step): `previous` is the step just completed and
   * `actorUserId` who completed it (null on submit). Documents with their own stage column follow it here.
   */
  onStepChange?(tenantId: string, entityId: string, step: { stepNo: number; name: string; approverType: string }, previous: { stepNo: number; approverType: string } | null, actorUserId: string | null): Promise<void>;
  /** The document's comments (shown in the inbox drawer). */
  comments?(tenantId: string, entityId: string): Promise<{ id: string; by: { id: string; name: string } | null; at: string; text: string }[]>;
}

/** The registered approval subjects, by entity type. */
@Injectable()
export class ApprovalSubjects {
  private readonly subjects = new Map<string, ApprovalSubject>();

  register(subject: ApprovalSubject) {
    for (const t of subject.entityTypes) this.subjects.set(t, subject);
  }

  get(entityType: string): ApprovalSubject | undefined {
    return this.subjects.get(entityType);
  }
}
