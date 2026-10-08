import type { Lead, LeadActivity, LeadBoard, LeadListQuery } from '../../../../../../shared/index.js';

/** Port: Platform.PlatformLeads, its activities, the pipeline view and the lead functions of 107-admin-growth-support.sql. */
export abstract class LeadStore {
  abstract list(q: LeadListQuery): Promise<Lead[]>;
  abstract get(id: string): Promise<Lead | null>;
  abstract activities(leadId: string): Promise<LeadActivity[]>;
  abstract pipeline(): Promise<LeadBoard['pipeline']>;
  abstract staff(): Promise<{ id: string; name: string }[]>;
  /** The column of a stage in board order (deleted leads excluded). */
  abstract column(stage: string): Promise<{ id: string; position: number }[]>;
  abstract partnerExists(id: string): Promise<boolean>;
  abstract planExists(id: string): Promise<boolean>;
  abstract staffExists(id: string): Promise<boolean>;
  /** Platform.platformLeadAddUpdate (insert without id, partial update with id; rowVersion checked when given). */
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Positions only (no stage change, no activity). */
  abstract setPositions(rows: { id: string; position: number }[]): Promise<void>;
  /** Platform.leadMoveStage: stage, position, dates and the STAGE_CHANGE activity. */
  abstract move(data: { leadId: string; toStage: string; boardPosition: number; note: string | null; lostReason: string | null; staffUserId: string | null; rowVersion: number }): Promise<void>;
  /** Platform.leadConvert: links the onboarded company, PAID, wonAt. */
  abstract convert(leadId: string, tenantId: string, staffUserId: string | null): Promise<void>;
  abstract addActivity(a: { leadId: string; activityType: string; note: string | null; staffUserId: string | null; fromStage?: string | null; toStage?: string | null }): Promise<void>;
}
