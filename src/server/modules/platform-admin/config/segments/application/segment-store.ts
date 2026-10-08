import type { Segment, SegmentOptions } from '../../../../../../shared/index.js';
import type { TenantFacts } from '../domain/segment-matcher.js';

/** A segment as stored, before membership and usage are worked out. */
export type StoredSegment = Omit<Segment, 'memberCount' | 'flagsUsing' | 'broadcastsUsing'>;

/** A tenant's matcher facts plus what the member list shows. */
export type TenantRow = TenantFacts & { code: string; name: string };

/** Port: Platform.TenantSegments with its rules and overrides (writes through Platform.tenantSegmentAddUpdate). */
export abstract class SegmentStore {
  abstract list(): Promise<StoredSegment[]>;
  abstract get(id: string): Promise<StoredSegment | null>;
  /** Names and keys of every segment, deleted ones included (both stay unique). */
  abstract allNamesAndKeys(): Promise<{ id: string; name: string; key: string; deleted: boolean }[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** SegmentTenants row id per tenant of one segment. */
  abstract overrideRowIds(segmentId: string): Promise<Map<string, string>>;
  abstract softDelete(id: string, rowVersion: number): Promise<void>;
  /** Every tenant with the facts the matcher reads. */
  abstract tenants(): Promise<TenantRow[]>;
  /** Plan codes → names. */
  abstract planNames(): Promise<Map<string, string>>;
  /** Feature flags whose SEGMENT rules name one of these keys (Phase 39 tables; soft link by key). */
  abstract flagsUsing(keys: string[]): Promise<Map<string, { key: string; name: string }[]>>;
  /** Tenant broadcasts sent to each segment (Phase 42). */
  abstract broadcastsUsing(ids: string[]): Promise<Map<string, number>>;
  abstract options(): Promise<SegmentOptions>;
}
