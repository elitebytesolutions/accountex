import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import {
  FlagCreateSchema,
  FlagDuplicateSchema,
  FlagEnvironmentInputSchema,
  FlagEnvQuerySchema,
  FlagEvaluateQuerySchema,
  FlagListQuerySchema,
  FlagStageInputSchema,
  FlagToggleInputSchema,
  FlagUpdateSchema,
  FlagVersionInputSchema,
  FLAG_ENVIRONMENTS,
  type AdminSession,
  type FlagCreate,
  type FlagDuplicate,
  type FlagEnvironment,
  type FlagEnvironmentInput,
  type FlagEvaluateQuery,
  type FlagListQuery,
  type FlagStageInput,
  type FlagToggleInput,
  type FlagUpdate,
  type FlagVersionInput,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { NotFoundError } from '../../../../core/domain/errors.js';
import { FlagEvaluationService } from '../application/flag-evaluation.service.js';
import { FlagsService } from '../application/flags.service.js';

const envParam = (env: string): FlagEnvironment => {
  const e = env.toUpperCase();
  if (!(FLAG_ENVIRONMENTS as readonly string[]).includes(e)) throw new NotFoundError('Unknown environment');
  return e as FlagEnvironment;
};

/** /api/admin/flags: Feature Flags and Flag Detail (Phase 39). */
@AdminRoute()
@Controller('admin/flags')
export class FlagsController {
  constructor(
    private readonly flags: FlagsService,
    private readonly evaluation: FlagEvaluationService,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(FlagListQuerySchema)) query: FlagListQuery) {
    return this.flags.list(query);
  }

  /** KPI row (view Platform.getFeatureFlagSummary). */
  @Get('summary')
  summary() {
    return this.flags.summary();
  }

  /** Select values: plans, segments, tenants, modules, flags, staff. */
  @Get('options')
  options() {
    return this.flags.options();
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(FlagCreateSchema)) body: FlagCreate) {
    return this.flags.create(admin, meta, body);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.flags.get(id);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(FlagUpdateSchema)) body: FlagUpdate) {
    return this.flags.update(admin, meta, id, body);
  }

  @Post(':id/stage')
  stage(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(FlagStageInputSchema)) body: FlagStageInput) {
    return this.flags.moveStage(admin, meta, id, body);
  }

  @Post(':id/archive')
  archive(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(FlagVersionInputSchema)) body: FlagVersionInput) {
    return this.flags.archive(admin, meta, id, body);
  }

  @Post(':id/restore')
  restore(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(FlagVersionInputSchema)) body: FlagVersionInput) {
    return this.flags.restore(admin, meta, id, body);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(FlagDuplicateSchema)) body: FlagDuplicate) {
    return this.flags.duplicate(admin, meta, id, body);
  }

  /** On / off in one environment (?env=). Kill switches need { confirmKey } = the flag key. */
  @Post(':id/toggle')
  toggle(
    @CurrentAdmin() admin: AdminSession,
    @ReqMeta() meta: RequestMeta,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(FlagEnvQuerySchema)) query: { env: FlagEnvironment },
    @Body(new ZodValidationPipe(FlagToggleInputSchema)) body: FlagToggleInput,
  ) {
    return this.flags.toggle(admin, meta, id, query.env, body);
  }

  /** The whole targeting of one environment (DEV / STAGING / PRODUCTION, any case). */
  @Put(':id/environments/:env')
  saveEnvironment(
    @CurrentAdmin() admin: AdminSession,
    @ReqMeta() meta: RequestMeta,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('env') env: string,
    @Body(new ZodValidationPipe(FlagEnvironmentInputSchema)) body: FlagEnvironmentInput,
  ) {
    return this.flags.saveEnvironment(admin, meta, id, envParam(env), body);
  }

  /** ?tenant=<id or code>&env= → the variation and why. */
  @Get(':id/evaluate')
  evaluate(@Param('id', new ParseUUIDPipe()) id: string, @Query(new ZodValidationPipe(FlagEvaluateQuerySchema)) query: FlagEvaluateQuery) {
    return this.evaluation.evaluate(id, query.tenant, query.env);
  }

  /** Every tenant's variation in one environment ("Tenants served"). */
  @Get(':id/served')
  served(@Param('id', new ParseUUIDPipe()) id: string, @Query(new ZodValidationPipe(FlagEnvQuerySchema)) query: { env: FlagEnvironment }) {
    return this.evaluation.served(id, query.env);
  }

  /** FlagAuditLogs, newest first (the detail page's audit log with before / after diffs). */
  @Get(':id/audit')
  audit(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.flags.audit(id);
  }
}
