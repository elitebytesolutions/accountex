import { Injectable } from '@nestjs/common';
import {
  segmentKeyFor,
  type AdminSession, type Segment, type SegmentCreate, type SegmentEvaluation, type SegmentOverride, type SegmentPreview, type SegmentRule, type SegmentUpdate,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { membershipOf, ruleMatches, type MatchRule, type MatchSegment } from '../domain/segment-matcher.js';
import { SegmentStore, type StoredSegment, type TenantRow } from './segment-store.js';

const toMatch = (rules: SegmentRule[]): MatchRule[] => rules.map((r) => ({ attribute: r.attribute, operator: r.operator, values: r.values }));
const matchSegment = (rules: SegmentRule[], overrides: SegmentOverride[]): MatchSegment => ({
  rules: toMatch(rules),
  include: new Set(overrides.filter((o) => o.membership === 'INCLUDE').map((o) => o.tenantId)),
  exclude: new Set(overrides.filter((o) => o.membership === 'EXCLUDE').map((o) => o.tenantId)),
});
/** Rules as Platform.tenantSegmentAddUpdate takes them (no ids: the set is replaced; positions 0..n). */
const ruleRows = (rules: SegmentRule[]) => rules.map((r, position) => ({ position, attribute: r.attribute, operator: r.operator, ruleValues: r.values }));

/**
 * Tenant segments (Super Admin › Feature Management › Segments): reusable tenant audiences that feature flags (Phase 39)
 * and broadcasts (Phase 42) target by key. Membership is computed by the pure matcher (domain/segment-matcher.ts).
 */
@Injectable()
export class SegmentsService {
  constructor(
    private readonly store: SegmentStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(): Promise<Segment[]> {
    const [rows, tenants] = await Promise.all([this.store.list(), this.store.tenants()]);
    return this.decorate(rows, tenants);
  }

  async get(id: string): Promise<Segment> {
    const row = await this.store.get(id);
    if (!row) throw new NotFoundError('Segment not found');
    return (await this.decorate([row], await this.store.tenants()))[0]!;
  }

  options() {
    return this.store.options();
  }

  /** Members of the saved segment, with the plan breakdown. */
  async evaluate(id: string): Promise<SegmentEvaluation> {
    const s = await this.get(id);
    return this.evaluateWith(s.rules, s.overrides);
  }

  /** Members of unsaved rules (the live count while editing). */
  preview(input: SegmentPreview): Promise<SegmentEvaluation> {
    return this.evaluateWith(input.rules, input.overrides);
  }

  async create(admin: AdminSession, meta: RequestMeta, input: SegmentCreate): Promise<Segment> {
    const key = await this.freeKeyAndName(input.name, null);
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({
      key, name: input.name, description: input.description, icon: input.icon, tone: input.tone, rules: ruleRows(input.rules),
    }));
    return this.get(id);
  }

  /** Name, description, icon and tone. The key never changes: flags and broadcasts link to it. */
  async update(admin: AdminSession, meta: RequestMeta, id: string, input: SegmentUpdate): Promise<Segment> {
    const s = await this.current(id, input.rowVersion);
    if (input.name && input.name.toLowerCase() !== s.name.toLowerCase()) await this.assertNameFree(input.name, id);
    const patch = Object.fromEntries(Object.entries({ name: input.name, description: input.description, icon: input.icon, tone: input.tone }).filter(([, v]) => v !== undefined));
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...patch, id, rowVersion: input.rowVersion }));
    return this.get(id);
  }

  async replaceRules(admin: AdminSession, meta: RequestMeta, id: string, rules: SegmentRule[], rowVersion: number): Promise<Segment> {
    await this.current(id, rowVersion);
    // The parent row is saved too (rowVersion check + touch), so the change shows on the segment's own history.
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion, rules: ruleRows(rules) }));
    return this.get(id);
  }

  async replaceOverrides(admin: AdminSession, meta: RequestMeta, id: string, overrides: SegmentOverride[], rowVersion: number): Promise<Segment> {
    await this.current(id, rowVersion);
    const known = new Set((await this.store.tenants()).map((t) => t.id));
    if (overrides.some((o) => !known.has(o.tenantId))) throw new ValidationError('Choose existing tenants', { overrides: ['Unknown tenant'] });
    // A tenant already overridden keeps its row (updated in place, no history churn); others are inserted, missing ones removed.
    const rowIds = await this.store.overrideRowIds(id);
    const tenants = overrides.map((o) => {
      const rowId = rowIds.get(o.tenantId);
      return rowId ? { id: rowId, membership: o.membership } : { tenantId: o.tenantId, membership: o.membership };
    });
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion, tenants }));
    return this.get(id);
  }

  /** Soft delete; refused while a feature flag or a broadcast uses the segment. */
  async delete(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const s = await this.current(id, rowVersion);
    if (s.flagsUsing.length || s.broadcastsUsing) {
      const what = [s.flagsUsing.length && `${s.flagsUsing.length} feature flag${s.flagsUsing.length === 1 ? '' : 's'}`, s.broadcastsUsing && `${s.broadcastsUsing} broadcast${s.broadcastsUsing === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
      throw new ConflictError(`Used by ${what}. Remove it from them first.`, undefined, { code: 'SEGMENT_IN_USE' });
    }
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.softDelete(id, rowVersion));
  }

  private async evaluateWith(rules: SegmentRule[], overrides: SegmentOverride[]): Promise<SegmentEvaluation> {
    const [tenants, plans] = await Promise.all([this.store.tenants(), this.store.planNames()]);
    const seg = matchSegment(rules, overrides);
    const members = tenants.flatMap((t) => {
      const why = membershipOf(seg, t);
      return why ? [{ id: t.id, code: t.code, name: t.name, city: t.city, industry: t.industry, plan: t.plan, matchedBy: why }] : [];
    });
    const byPlan = new Map<string | null, number>();
    for (const m of members) byPlan.set(m.plan, (byPlan.get(m.plan) ?? 0) + 1);
    const planOrder = [...plans.keys()];
    return {
      total: tenants.length,
      count: members.length,
      byPlan: [...planOrder.map((code) => ({ plan: code as string | null, label: plans.get(code)!, count: byPlan.get(code) ?? 0 })),
        ...(byPlan.get(null) ? [{ plan: null, label: 'No plan', count: byPlan.get(null)! }] : [])],
      tenants: members.sort((a, b) => a.name.localeCompare(b.name)),
      ruleCounts: toMatch(rules).map((r) => tenants.filter((t) => ruleMatches(r, t)).length),
    };
  }

  private async decorate(rows: StoredSegment[], tenants: TenantRow[]): Promise<Segment[]> {
    const [flags, broadcasts] = await Promise.all([this.store.flagsUsing(rows.map((r) => r.key)), this.store.broadcastsUsing(rows.map((r) => r.id))]);
    return rows.map((r) => {
      const seg = matchSegment(r.rules, r.overrides);
      return {
        ...r,
        memberCount: tenants.filter((t) => membershipOf(seg, t) !== null).length,
        flagsUsing: flags.get(r.key) ?? [],
        broadcastsUsing: broadcasts.get(r.id) ?? 0,
      };
    });
  }

  /** The key for a new segment's name (a suffix when another name reduces to the same key). Refuses a taken name. */
  private async freeKeyAndName(name: string, id: string | null): Promise<string> {
    await this.assertNameFree(name, id);
    const all = await this.store.allNamesAndKeys();
    const base = segmentKeyFor(name);
    let key = base;
    for (let n = 2; all.some((s) => s.key === key); n++) key = `${base}_${n}`;
    return key;
  }

  private async assertNameFree(name: string, id: string | null) {
    const hit = (await this.store.allNamesAndKeys()).find((s) => s.id !== id && s.name.toLowerCase() === name.trim().toLowerCase());
    if (hit) {
      throw new ConflictError(hit.deleted ? `“${name}” belonged to a deleted segment and can't be reused.` : `A segment named “${name}” already exists.`,
        { name: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
  }

  private async current(id: string, rowVersion: number) {
    const s = await this.get(id);
    if (s.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this segment. Reload and try again.');
    return s;
  }
}
