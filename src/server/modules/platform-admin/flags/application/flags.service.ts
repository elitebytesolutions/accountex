import { Injectable } from '@nestjs/common';
import {
  BOOLEAN_VARIATIONS,
  type AdminSession,
  type FlagCreate,
  type FlagDetail,
  type ChangeRequestPatch,
  type FlagDuplicate,
  type FlagEnvironment,
  type FlagEnvironmentInput,
  type FlagEnvironmentState,
  type FlagListQuery,
  type FlagStageInput,
  type FlagToggleInput,
  type FlagUpdate,
  type FlagVersionInput,
} from '../../../../../shared/index.js';
import { adminActorContext } from '../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import {
  FLAG_ENVS,
  findPrerequisiteCycle,
  initialDefaultRule,
  isKillSwitch,
  stageMoveError,
  targetingIndexErrors,
  variationEditError,
} from '../domain/flag-rules.js';
import { FlagStore, type FlagAuditWrite, type PrerequisiteRow } from './flag-store.js';
import { envLabel, targetingSnapshot, targetingSummary, type TargetingSnapshot } from './targeting-snapshot.js';

/** Phase 43: the change a Production request carries (TOGGLE / TARGETING from the pages, ROLLOUT from a scheduled step). */
export type FlagChangePlan = { before: TargetingSnapshot; after: TargetingSnapshot; summary: string; patch: ChangeRequestPatch };
/** Stable JSON (sorted keys): snapshots stored as jsonb come back with their keys reordered. */
const stableJson = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(stableJson).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(',')}}`
  : JSON.stringify(v ?? null);

/**
 * Feature flags (Phase 39): one UnitOfWork.run(adminActorContext) per save, writing the row changes (platform history
 * by trigger) and a FlagAuditLogs entry with the matching eventKind and before / after state.
 */
@Injectable()
export class FlagsService {
  constructor(
    private readonly store: FlagStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(query: FlagListQuery) {
    return this.store.list(query);
  }

  summary() {
    return this.store.summary();
  }

  options() {
    return this.store.options();
  }

  async get(id: string): Promise<FlagDetail> {
    const f = await this.store.detail(id);
    if (!f) throw new NotFoundError('Flag not found');
    return f;
  }

  async audit(id: string) {
    await this.get(id);
    return this.store.audit(id, 100);
  }

  async create(admin: AdminSession, meta: RequestMeta, input: FlagCreate): Promise<FlagDetail> {
    const staff = staffOf(admin);
    if (await this.store.keyExists(input.key)) throw new ConflictError('A flag with this key already exists', { key: ['A flag with this key already exists'] });
    const variations = input.variationKind === 'BOOLEAN' ? BOOLEAN_VARIATIONS.map((v) => ({ ...v })) : input.variations;
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      const flagId = await this.store.save({
        key: input.key, name: input.name, description: input.description, flagType: input.flagType, secondaryType: input.secondaryType,
        category: input.category, stage: 'DEFINE', ownerStaffId: input.ownerStaffId ?? staff, tags: input.tags, variationKind: input.variationKind,
        isTemporary: input.isTemporary, expiresOn: input.isTemporary ? input.expiresOn : null,
        environments: FLAG_ENVS.map((environment) => ({ environment, isOn: false })),
        variations: variations.map((v, idx) => ({ idx, name: v.name, value: v.value })),
      });
      await this.store.createDefaultRules(flagId, initialDefaultRule(input.flagType));
      await this.store.writeAudit({
        flagId, environment: 'ALL', eventKind: 'CREATED', summary: 'Flag created', before: {},
        after: { key: input.key, type: input.flagType, temporary: input.isTemporary, variations: variations.map((v) => v.name) },
      });
      return flagId;
    });
    return this.get(id);
  }

  async update(admin: AdminSession, meta: RequestMeta, id: string, input: FlagUpdate): Promise<FlagDetail> {
    const cur = await this.editable(id);
    if (input.key !== undefined && input.key !== cur.key) throw new ValidationError('A flag’s key can’t be changed', { key: ['The key can’t be changed'] }, { code: 'FLAG_KEY_IMMUTABLE' });
    if (input.rowVersion !== cur.rowVersion) throw stale();

    const data: Record<string, unknown> = { id, rowVersion: input.rowVersion };
    const before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
    const set = (k: string, next: unknown, prev: unknown) => {
      if (next === undefined || JSON.stringify(next) === JSON.stringify(prev)) return;
      data[k] = next; before[k] = prev; after[k] = next;
    };
    set('name', input.name, cur.name);
    set('description', input.description, cur.description);
    set('secondaryType', input.secondaryType, cur.secondaryType);
    set('category', input.category, cur.category);
    set('tags', input.tags, cur.tags);
    set('ownerStaffId', input.ownerStaffId, cur.ownerStaffId);
    set('isTemporary', input.isTemporary, cur.isTemporary);
    set('expiresOn', input.expiresOn, cur.expiresOn);
    set('staleReason', input.staleReason, cur.staleReason);

    const temporary = (data.isTemporary ?? cur.isTemporary) as boolean;
    if (temporary && !(data.expiresOn ?? cur.expiresOn)) throw new ValidationError('Temporary flags need an expiry date', { expiresOn: ['Temporary flags need an expiry date'] });
    if (!temporary && cur.expiresOn && data.expiresOn === undefined) data.expiresOn = null;
    const secondary = data.secondaryType === undefined ? cur.secondaryType : data.secondaryType;
    if (secondary && secondary === cur.flagType) throw new ValidationError('Pick a different secondary type', { secondaryType: ['Pick a different secondary type'] });
    if (data.staleReason !== undefined) data.staleSince = data.staleReason ? new Date().toISOString().slice(0, 10) : null;

    if (input.variations) {
      const err = variationEditError(cur.variations.length, input.variations.length)
        ?? (cur.variationKind === 'BOOLEAN' && (input.variations.length !== 2 || input.variations[0]!.value !== 'true' || input.variations[1]!.value !== 'false')
          ? 'A boolean flag keeps its two variations (true / false); only the names can change' : null)
        ?? (new Set(input.variations.map((v) => v.value)).size !== input.variations.length ? 'Variation values must be unique' : null);
      if (err) throw new ValidationError(err, { variations: [err] });
      const changed = input.variations.some((v, i) => v.name !== cur.variations[i]?.name || v.value !== cur.variations[i]?.value) || input.variations.length !== cur.variations.length;
      if (changed) {
        const ids = await this.store.variationIds(id);
        data.variations = input.variations.map((v, idx) => ({ ...(ids.has(idx) ? { id: ids.get(idx) } : {}), idx, name: v.name, value: v.value }));
        before.variations = cur.variations.map((v) => `${v.name} (${v.value})`);
        after.variations = input.variations.map((v) => `${v.name} (${v.value})`);
      }
    }
    if (Object.keys(after).length === 0) return cur;

    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      await this.store.save(data);
      await this.store.writeAudit({ flagId: id, environment: 'ALL', eventKind: 'LIFECYCLE', summary: `Details edited: ${Object.keys(after).join(', ')}`, before, after });
    });
    return this.get(id);
  }

  async moveStage(admin: AdminSession, meta: RequestMeta, id: string, input: FlagStageInput): Promise<FlagDetail> {
    const cur = await this.get(id);
    if (input.rowVersion !== cur.rowVersion) throw stale();
    const err = stageMoveError(cur.stage, input.stage);
    if (err) throw new ValidationError(err, { stage: [err] }, { code: 'FLAG_STAGE_ORDER' });
    const archiving = input.stage === 'ARCHIVED';
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      await this.store.save({
        id, rowVersion: input.rowVersion, stage: input.stage,
        ...(archiving ? { archivedAt: new Date().toISOString(), staleReason: null, staleSince: null } : {}),
      });
      await this.store.writeAudit({
        flagId: id, environment: 'ALL', eventKind: archiving ? 'ARCHIVED' : 'LIFECYCLE',
        summary: archiving ? 'Flag archived' : `Lifecycle ${label(cur.stage)} → ${label(input.stage)}`, before: { stage: cur.stage }, after: { stage: input.stage },
      });
    });
    return this.get(id);
  }

  archive(admin: AdminSession, meta: RequestMeta, id: string, input: FlagVersionInput) {
    return this.moveStage(admin, meta, id, { stage: 'ARCHIVED', rowVersion: input.rowVersion });
  }

  /** An archived flag comes back in Cleanup (template row menu "Restore"). */
  async restore(admin: AdminSession, meta: RequestMeta, id: string, input: FlagVersionInput): Promise<FlagDetail> {
    const cur = await this.get(id);
    if (input.rowVersion !== cur.rowVersion) throw stale();
    if (cur.stage !== 'ARCHIVED') throw new ValidationError('Only archived flags can be restored', undefined, { code: 'FLAG_STAGE_ORDER' });
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      await this.store.save({ id, rowVersion: input.rowVersion, stage: 'CLEANUP', archivedAt: null });
      await this.store.writeAudit({ flagId: id, environment: 'ALL', eventKind: 'RESTORED', summary: 'Flag restored to Cleanup', before: { stage: 'ARCHIVED' }, after: { stage: 'CLEANUP' } });
    });
    return this.get(id);
  }

  /** A copy in Define, owned by the admin, off in every environment, with the same variations and targeting. */
  async duplicate(admin: AdminSession, meta: RequestMeta, id: string, input: FlagDuplicate): Promise<FlagDetail> {
    const staff = staffOf(admin);
    const src = await this.get(id);
    let key = input.key || `${src.key}_copy`.slice(0, 60);
    if (!input.key) for (let n = 2; await this.store.keyExists(key); n++) key = `${src.key.slice(0, 54)}_copy${n}`;
    else if (await this.store.keyExists(key)) throw new ConflictError('A flag with this key already exists', { key: ['A flag with this key already exists'] });
    const newId = await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      const flagId = await this.store.save({
        key, name: input.name || `${src.name} (copy)`.slice(0, 120), description: src.description, flagType: src.flagType, secondaryType: src.secondaryType,
        category: src.category, stage: 'DEFINE', ownerStaffId: staff, tags: src.tags, variationKind: src.variationKind,
        isTemporary: src.isTemporary, expiresOn: src.expiresOn,
        environments: FLAG_ENVS.map((environment) => ({ environment, isOn: false })),
        variations: src.variations.map((v) => ({ idx: v.idx, name: v.name, value: v.value })),
      });
      await this.store.copyTargeting(id, flagId);
      await this.store.writeAudit({ flagId, environment: 'ALL', eventKind: 'CREATED', summary: `Flag created as a copy of ${src.key}`, before: {}, after: { key, copyOf: src.key, variations: src.variations.map((v) => v.name) } });
      return flagId;
    });
    return this.get(newId);
  }

  /**
   * On / off in one environment. A kill switch needs its key typed (`confirmKey`); flipping one in Production is
   * applied at once and logged as an emergency change. Phase 43: any other Production toggle goes through a change
   * request (POST /api/admin/change-requests), so it is refused here.
   */
  async toggle(admin: AdminSession, meta: RequestMeta, id: string, env: FlagEnvironment, input: FlagToggleInput): Promise<FlagDetail> {
    const cur = await this.editable(id);
    const kill = isKillSwitch(cur);
    if (env === 'PRODUCTION' && !kill) throw changeRequestRequired();
    if (kill && input.confirmKey !== cur.key) throw killConfirm();
    const state = envOf(cur, env);
    if (state.isOn === input.isOn) return cur;
    const before = targetingSnapshot(cur, state);
    const after = { ...before, on: input.isOn };
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      await this.writeToggle(cur, env, input.isOn);
      await this.store.writeAudit(kill
        ? { flagId: id, environment: env, eventKind: 'KILL_SWITCH', summary: `Kill switch ${input.isOn ? 'restored' : 'flipped OFF'} in ${envLabel(env)}`, before, after, isEmergency: env === 'PRODUCTION' }
        : { flagId: id, environment: env, eventKind: 'TOGGLED', summary: `Targeting turned ${input.isOn ? 'ON' : 'OFF'} in ${envLabel(env)}`, before, after });
    });
    return this.get(id);
  }

  /**
   * PUT one environment's whole targeting: on / off, prerequisites, individual targets, rules, default rule, off variation.
   * Phase 43: Production targeting is changed through a change request (refused here).
   */
  async saveEnvironment(admin: AdminSession, meta: RequestMeta, id: string, env: FlagEnvironment, input: FlagEnvironmentInput): Promise<FlagDetail> {
    const cur = await this.editable(id);
    if (env === 'PRODUCTION') throw changeRequestRequired();
    const state = envOf(cur, env);
    if (input.envRowVersion !== state.rowVersion) throw stale();
    await this.checkEnvironment(cur, id, env, input);

    const isOn = input.isOn ?? state.isOn;
    const kill = isKillSwitch(cur);
    if (kill && isOn !== state.isOn && input.confirmKey !== cur.key) throw killConfirm();

    const before = targetingSnapshot(cur, state);
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      const after = await this.writeEnvironment(id, env, state, input, isOn);
      const entry: FlagAuditWrite = kill && isOn !== state.isOn
        ? { flagId: id, environment: env, eventKind: 'KILL_SWITCH', summary: `Kill switch ${isOn ? 'restored' : 'flipped OFF'} in ${envLabel(env)} · ${targetingSummary(before, after)}`, before, after }
        : { flagId: id, environment: env, eventKind: 'TARGETING', summary: `${targetingSummary(before, after)} (${envLabel(env)})`, before, after };
      await this.store.writeAudit(entry);
    });
    return this.get(id);
  }

  /**
   * Phase 43: validates a change for a change request without applying it and returns the before / after snapshots
   * (the request's diff), its one-line summary and the patch an approval applies.
   */
  async previewChange(id: string, env: FlagEnvironment, change: ChangeRequestPatch): Promise<FlagChangePlan> {
    const cur = await this.editable(id);
    const state = envOf(cur, env);
    const before = targetingSnapshot(cur, state);
    if (change.kind === 'TOGGLE') {
      const after = { ...before, on: change.isOn };
      return { before, after, summary: `Turn targeting ${change.isOn ? 'ON' : 'OFF'}`, patch: { kind: 'TOGGLE', isOn: change.isOn } };
    }
    if (change.kind === 'ROLLOUT' && !state.defaultRule) throw new ValidationError('This environment has no default rule to ramp', undefined, { code: 'SCHEDULE_INVALID' });
    const input = change.kind === 'TARGETING' ? change.input : this.rolloutInput(state, change.rolloutPct);
    if (change.kind === 'TARGETING' && input.envRowVersion !== state.rowVersion) throw stale();
    await this.checkEnvironment(cur, id, env, input);
    const after = targetingSnapshot(cur, await this.synthesise(state, input, input.isOn ?? state.isOn));
    const summary = change.kind === 'ROLLOUT' ? `Scheduled step: rollout ${state.defaultRule?.rolloutPct ?? 0}% → ${change.rolloutPct}%` : targetingSummary(before, after);
    const patch: ChangeRequestPatch = change.kind === 'ROLLOUT' ? { kind: 'ROLLOUT', rolloutPct: change.rolloutPct } : { kind: 'TARGETING', input: { ...input, confirmKey: undefined } };
    return { before, after, summary, patch };
  }

  /**
   * Phase 43: applies an approved change request's patch. Runs inside the caller's transaction (the change request
   * service writes the CR_APPLIED audit row). Refused when the environment changed since the request (its before
   * snapshot no longer matches).
   */
  async applyChange(id: string, env: FlagEnvironment, patch: ChangeRequestPatch, expectedBefore: unknown): Promise<{ before: TargetingSnapshot; after: TargetingSnapshot; summary: string }> {
    const cur = await this.editable(id);
    const state = envOf(cur, env);
    const before = targetingSnapshot(cur, state);
    if (stableJson(before) !== stableJson(expectedBefore)) {
      throw new ConflictError('The flag changed since this request was made. Reject it and request the change again.', undefined, { code: 'CR_STALE' });
    }
    if (patch.kind === 'TOGGLE') {
      if (state.isOn !== patch.isOn) await this.writeToggle(cur, env, patch.isOn);
      const after = { ...before, on: patch.isOn };
      return { before, after, summary: `Targeting turned ${patch.isOn ? 'ON' : 'OFF'} in ${envLabel(env)}` };
    }
    const input = patch.kind === 'TARGETING' ? { ...patch.input, envRowVersion: state.rowVersion } : this.rolloutInput(state, patch.rolloutPct);
    await this.checkEnvironment(cur, id, env, input);
    const after = await this.writeEnvironment(id, env, state, input, input.isOn ?? state.isOn);
    return { before, after, summary: `${targetingSummary(before, after)} (${envLabel(env)})` };
  }

  /** The environment's targeting as an input, with the default rule turned into a rollout at `pct` (scheduled steps). */
  private rolloutInput(state: FlagEnvironmentState, pct: number): FlagEnvironmentInput {
    const d = state.defaultRule;
    return {
      envRowVersion: state.rowVersion, isOn: state.isOn,
      targets: state.targets.map((t) => ({ tenantId: t.tenantId, variationIdx: t.variationIdx })),
      rules: state.rules.map((r) => ({ attribute: r.attribute as FlagEnvironmentInput['rules'][number]['attribute'], operator: r.operator as FlagEnvironmentInput['rules'][number]['operator'], ruleValues: r.ruleValues, serveVariationIdx: r.serveVariationIdx })),
      defaultRule: {
        defaultRule: 'ROLLOUT', defaultVariationIdx: null, rolloutPct: pct, rolloutVariationIdx: d?.rolloutVariationIdx ?? 0,
        rolloutRestVariationIdx: d?.rolloutRestVariationIdx ?? 1, offVariationIdx: d?.offVariationIdx ?? 1, bucketBy: d?.bucketBy === 'TENANT_ID' ? 'TENANT_ID' : 'TENANT_CODE',
      },
      prerequisites: state.prerequisites.map((p) => (p.prerequisiteModuleId ? { prerequisiteModuleId: p.prerequisiteModuleId } : { prerequisiteFlagId: p.prerequisiteFlagId!, requiredVariationIdx: p.requiredVariationIdx ?? 0 })),
    };
  }

  /** The environment state an input would produce (keys and codes from the options), for the request's diff. */
  private async synthesise(state: FlagEnvironmentState, input: FlagEnvironmentInput, isOn: boolean): Promise<FlagEnvironmentState> {
    const o = await this.store.options();
    const d = input.defaultRule;
    return {
      ...state, isOn,
      prerequisites: input.prerequisites.map((p) => ('prerequisiteFlagId' in p
        ? { prerequisiteFlagId: p.prerequisiteFlagId, prerequisiteFlagKey: o.flags.find((f) => f.id === p.prerequisiteFlagId)?.key ?? null, requiredVariationIdx: p.requiredVariationIdx, prerequisiteModuleId: null, prerequisiteModuleKey: null }
        : { prerequisiteFlagId: null, prerequisiteFlagKey: null, requiredVariationIdx: null, prerequisiteModuleId: p.prerequisiteModuleId, prerequisiteModuleKey: o.modules.find((m) => m.id === p.prerequisiteModuleId)?.key ?? null })),
      targets: input.targets.map((t) => {
        const tn = o.tenants.find((x) => x.id === t.tenantId);
        return { tenantId: t.tenantId, tenantCode: tn?.code ?? t.tenantId, tenantName: tn?.name ?? t.tenantId, variationIdx: t.variationIdx };
      }),
      rules: input.rules.map((r) => ({ attribute: r.attribute, operator: r.operator, ruleValues: r.ruleValues, serveVariationIdx: r.serveVariationIdx })),
      defaultRule: {
        defaultRule: d.defaultRule, defaultVariationIdx: d.defaultRule === 'VARIATION' ? d.defaultVariationIdx : null, rolloutPct: d.defaultRule === 'ROLLOUT' ? d.rolloutPct : null,
        rolloutVariationIdx: d.rolloutVariationIdx, rolloutRestVariationIdx: d.rolloutRestVariationIdx, offVariationIdx: d.offVariationIdx, bucketBy: d.bucketBy,
      },
    };
  }

  /** Validation of one environment's targeting (indexes, duplicate targets, prerequisites and their cycles). */
  private async checkEnvironment(cur: FlagDetail, id: string, env: FlagEnvironment, input: FlagEnvironmentInput) {
    const details = targetingIndexErrors(input, cur.variations.length);
    const seen = new Set<string>();
    input.targets.forEach((t, i) => {
      if (seen.has(t.tenantId)) details[`targets.${i}.tenantId`] = 'This tenant is already targeted';
      seen.add(t.tenantId);
    });

    // prerequisites: other flags (not this one, each once, an existing variation) or platform modules
    const prereqFlags = input.prerequisites.flatMap((p) => ('prerequisiteFlagId' in p ? [p] : []));
    const counts = await this.store.variationCounts(prereqFlags.map((p) => p.prerequisiteFlagId));
    const seenPre = new Set<string>();
    input.prerequisites.forEach((p, i) => {
      const ref = 'prerequisiteFlagId' in p ? p.prerequisiteFlagId : p.prerequisiteModuleId;
      if (seenPre.has(ref)) details[`prerequisites.${i}`] = 'Listed twice';
      seenPre.add(ref);
      if (!('prerequisiteFlagId' in p)) return;
      if (p.prerequisiteFlagId === id) details[`prerequisites.${i}`] = 'A flag can’t be its own prerequisite';
      else if (!counts.has(p.prerequisiteFlagId)) details[`prerequisites.${i}`] = 'Flag not found';
      else if (p.requiredVariationIdx >= counts.get(p.prerequisiteFlagId)!) details[`prerequisites.${i}.requiredVariationIdx`] = 'No such variation';
    });
    if (Object.keys(details).length) throw new ValidationError('Check the highlighted targeting', Object.fromEntries(Object.entries(details).map(([k, v]) => [k, [v]])));

    const cycle = findPrerequisiteCycle(id, prereqFlags.map((p) => p.prerequisiteFlagId), await this.store.prerequisiteEdges(env));
    if (cycle) {
      const keys = await this.keysOf(cycle);
      throw new ConflictError(`Prerequisite loop: ${keys.join(' → ')}`, { prerequisites: [`Prerequisite loop: ${keys.join(' → ')}`] }, { code: 'FLAG_PREREQUISITE_CYCLE', log: { cycle } });
    }
  }

  /** Writes one environment's targeting (inside the caller's transaction) and returns the snapshot after it. */
  private async writeEnvironment(id: string, env: FlagEnvironment, state: FlagEnvironmentState, input: FlagEnvironmentInput, isOn: boolean): Promise<TargetingSnapshot> {
    if (!(await this.store.touchEnvironment(state.id, state.rowVersion, isOn))) throw stale();

    const existing = await this.store.prerequisiteRows(id);
    const mine = existing.filter((r) => r.flagEnvironmentId === state.id);
    const rows: PrerequisiteRow[] = [
      ...existing.filter((r) => r.flagEnvironmentId !== state.id).map((r) => ({ ...r })),
      ...input.prerequisites.map((p): PrerequisiteRow => {
        const flagId = 'prerequisiteFlagId' in p ? p.prerequisiteFlagId : null;
        const moduleId = 'prerequisiteModuleId' in p ? p.prerequisiteModuleId : null;
        const keep = mine.find((r) => (flagId ? r.prerequisiteFlagId === flagId : r.prerequisiteModuleId === moduleId));
        return {
          ...(keep ? { id: keep.id } : {}), flagEnvironmentId: state.id, prerequisiteFlagId: flagId,
          requiredVariationIdx: 'requiredVariationIdx' in p ? p.requiredVariationIdx : null, prerequisiteModuleId: moduleId,
        };
      }),
    ];
    await this.store.save({ id, prerequisites: rows });
    await this.store.writeTargeting(id, state.id, { rules: input.rules, targets: input.targets, defaultRule: input.defaultRule });

    const now = await this.store.detail(id);
    return targetingSnapshot(now!, envOf(now!, env));
  }

  /** On / off of one environment (inside the caller's transaction). */
  private async writeToggle(cur: FlagDetail, env: FlagEnvironment, isOn: boolean) {
    await this.store.save({ id: cur.id, environments: cur.environments.map((e) => ({ id: e.id, ...(e.environment === env ? { isOn } : {}) })) });
  }

  private async editable(id: string): Promise<FlagDetail> {
    const f = await this.get(id);
    if (f.stage === 'ARCHIVED') throw new ConflictError('This flag is archived. Restore it before changing it.', undefined, { code: 'FLAG_ARCHIVED' });
    return f;
  }

  private async keysOf(ids: string[]): Promise<string[]> {
    const all = await this.store.list({ stage: undefined });
    const archived = await this.store.list({ stage: 'ARCHIVED' });
    const byId = new Map([...all, ...archived].map((f) => [f.id, f.key]));
    return ids.map((i) => byId.get(i) ?? i);
  }
}

const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const stale = () => new ConcurrencyError('Someone else changed this flag. Reload and try again.');
const killConfirm = () => new ValidationError('Type the flag key to confirm flipping a kill switch', { confirmKey: ['Type the flag key to confirm'] }, { code: 'FLAG_KILL_CONFIRM_REQUIRED' });
/** Phase 43: Production toggles (other than kill switches) and targeting saves go through a change request. */
const changeRequestRequired = () => new ConflictError('Production changes go through a change request. Submit one for approval.', undefined, { code: 'FLAG_CHANGE_REQUEST_REQUIRED' });

function envOf(f: FlagDetail, env: string) {
  const e = f.environments.find((x) => x.environment === env);
  if (!e) throw new NotFoundError(`The flag has no ${envLabel(env)} environment`);
  return e;
}

/** The Super Admin's PlatformStaff mirror: flag owner and the actor of every platform change. */
function staffOf(admin: AdminSession): string {
  if (!admin.staffId) throw new ForbiddenError('Your admin account has no platform staff record yet. Sign in again.');
  return admin.staffId;
}
