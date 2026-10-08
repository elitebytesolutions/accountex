import type { PrivacyRequest, PrivacyRequestCreate, PrivacySummary } from '../../../../../../shared/index.js';

/** Port: Platform.PrivacyRequests and their workflow functions (Phase 43). */
export abstract class PrivacyStore {
  abstract list(): Promise<PrivacyRequest[]>;
  abstract get(id: string): Promise<PrivacyRequest | null>;
  abstract tenant(id: string): Promise<{ id: string; code: string; name: string; status: string } | null>;
  /** An open (not DONE / REJECTED) request of this type exists for the company. */
  abstract hasOpen(tenantId: string, requestType: string): Promise<boolean>;
  /** Platform.privacyRequestAddUpdate (company from the payload; PRV-YYYY-NNN, due in 30 days). */
  abstract create(input: PrivacyRequestCreate): Promise<string>;
  abstract verify(id: string): Promise<void>;
  /** Returns the step after the approval (a deletion stays VERIFIED until its second approver). */
  abstract approve(id: string, note: string | null): Promise<string>;
  abstract reject(id: string, reason: string): Promise<void>;
  abstract startExport(id: string, backupRunId: string): Promise<void>;
  /** Platform.privacyRequestFulfilExport: DONE when the run completed, back to APPROVED when it failed. */
  abstract fulfilExport(id: string): Promise<string>;
  /** Platform.privacyRequestFulfilDelete: anonymise, revoke sessions, close the company, certificate. */
  abstract fulfilDelete(id: string, confirmCode: string): Promise<PrivacySummary>;
  abstract isSolo(): Promise<boolean>;
  /** The ids behind a request (first approver, export run). */
  abstract refs(id: string): Promise<{ approver1StaffId: string | null; exportBackupRunId: string | null } | null>;
}
