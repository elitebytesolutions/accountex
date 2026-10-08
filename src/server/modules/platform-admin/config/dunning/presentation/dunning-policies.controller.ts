import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  DunningPolicyActivateSchema, DunningPolicyCreateSchema, DunningPolicyUpdateSchema, RowVersionSchema,
  type AdminSession, type DunningPolicyActivate, type DunningPolicyCreate, type DunningPolicyUpdate,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { DunningPoliciesService } from '../application/dunning-policies.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/admin/dunning-policies: the dunning policy panels of Billing › Dunning & Collections. */
@AdminRoute()
@Controller('admin/dunning-policies')
export class DunningPoliciesController {
  constructor(private readonly policies: DunningPoliciesService) {}

  @Get()
  list() {
    return this.policies.list();
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.policies.get(id);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(DunningPolicyCreateSchema)) body: DunningPolicyCreate) {
    return this.policies.create(admin, meta, body);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DunningPolicyUpdateSchema)) body: DunningPolicyUpdate) {
    return this.policies.update(admin, meta, id, body);
  }

  @Post(':id/activate')
  @HttpCode(200)
  activate(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DunningPolicyActivateSchema)) body: DunningPolicyActivate) {
    return this.policies.activate(admin, meta, id, body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(pipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.policies.delete(admin, meta, id, q.rowVersion);
  }
}
