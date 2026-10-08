import { Injectable } from '@nestjs/common';
import type { FlagEnvironment, FlagEvaluation, FlagServed, MyFlags, SessionUser } from '../../../../../shared/index.js';
import { NotFoundError } from '../../../../core/domain/errors.js';
import { evaluateFlag, rolloutBucket, type EvalContext } from '../domain/flag-evaluator.js';
import { EvaluationSource, type EvaluableFlag } from './evaluation-source.js';

const ORDER: Record<string, number> = { TARGET: 0, RULE: 1, ROLLOUT: 2, DEFAULT: 3, OFF: 4, PREREQUISITE_FAILED: 5, ARCHIVED: 6 };

/** Evaluates flags with the pure evaluator over data loaded once per request (admin "evaluate", "Tenants served", workspace /me/flags). */
@Injectable()
export class FlagEvaluationService {
  constructor(private readonly source: EvaluationSource) {}

  private async context(env: string): Promise<{ flags: EvaluableFlag[]; ctx: EvalContext }> {
    const [flags, segments, modules] = await Promise.all([this.source.flags(env), this.source.segments(), this.source.modules()]);
    return { flags, ctx: { flags: new Map(flags.map((f) => [f.id, f])), segments, modules } };
  }

  async evaluate(flagId: string, tenantRef: string, env: FlagEnvironment): Promise<FlagEvaluation> {
    const { flags, ctx } = await this.context(env);
    const f = flags.find((x) => x.id === flagId);
    if (!f) throw new NotFoundError('Flag not found');
    const t = await this.source.tenant(tenantRef);
    if (!t) throw new NotFoundError('Tenant not found');
    const r = evaluateFlag(f, t, ctx);
    const v = f.variations.find((x) => x.idx === r.variationIdx);
    return {
      flagId: f.id, flagKey: f.key, environment: env, tenant: { id: t.id, code: t.code, name: t.name },
      variationIdx: r.variationIdx, variationName: v?.name ?? null, variationValue: v?.value ?? null, reason: r.reason,
    };
  }

  /** Every tenant's variation in one environment, targets and rules first (template "Tenants served"). */
  async served(flagId: string, env: FlagEnvironment): Promise<FlagServed> {
    const [{ flags, ctx }, tenants] = await Promise.all([this.context(env), this.source.tenants()]);
    const f = flags.find((x) => x.id === flagId);
    if (!f) throw new NotFoundError('Flag not found');
    const rows = tenants.map((t) => {
      const r = evaluateFlag(f, t, ctx);
      return { tenantId: t.id, code: t.code, name: t.name, planCode: t.planCode, city: t.city, variationIdx: r.variationIdx, reason: r.reason, bucket: rolloutBucket(t, f.key, f.defaultRule?.bucketBy ?? 'TENANT_CODE') };
    });
    rows.sort((a, b) => (ORDER[a.reason.kind] ?? 9) - (ORDER[b.reason.kind] ?? 9) || a.name.localeCompare(b.name));
    return { environment: env, total: rows.length, rows };
  }

  /** The signed-in tenant's PRODUCTION flags (archived flags are not served). */
  async myFlags(user: SessionUser): Promise<MyFlags> {
    const [{ flags, ctx }, t] = await Promise.all([this.context('PRODUCTION'), this.source.tenant(user.tenantId, user.roles)]);
    const out: MyFlags = { environment: 'PRODUCTION', flags: {} };
    if (!t) return out;
    for (const f of flags) {
      if (f.archived) continue;
      const r = evaluateFlag(f, t, ctx);
      const v = f.variations.find((x) => x.idx === r.variationIdx);
      if (v) out.flags[f.key] = { value: v.value, variationIdx: r.variationIdx, reason: r.reason.kind };
    }
    return out;
  }
}
