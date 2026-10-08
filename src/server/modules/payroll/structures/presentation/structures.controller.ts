import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { RowVersionSchema, StructureCreateSchema, StructureUpdateSchema, type SessionUser, type StructureCreate, type StructureUpdate } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { StructuresService } from '../application/structures.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const DuplicateSchema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9-]{0,9}$/, 'Like G2 or S1'), name: z.string().trim().min(2, 'Name the copy').max(80) });

/** /api/payroll/structures: Workforce › Payroll › Salary Structures (Structures & Grades tab). */
@Controller('payroll/structures')
export class StructuresController {
  constructor(private readonly structures: StructuresService) {}

  @Get()
  @RequirePermission('prun:view')
  list(@CurrentUser() user: SessionUser) {
    return this.structures.list(user);
  }

  @Post()
  @RequirePermission('prun:edit')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(StructureCreateSchema)) body: StructureCreate) {
    return this.structures.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('prun:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(StructureUpdateSchema)) body: StructureUpdate) {
    return this.structures.update(user, meta, id, body);
  }

  @Post(':id/duplicate')
  @RequirePermission('prun:edit')
  duplicate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DuplicateSchema)) body: z.infer<typeof DuplicateSchema>) {
    return this.structures.duplicate(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('prun:edit')
  action(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', pipe(z.enum(['activate', 'retire', 'draft']))) action: 'activate' | 'retire' | 'draft', @Body(version) body: { rowVersion: number }) {
    return this.structures.setStatus(user, meta, id, action, body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('prun:edit')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.structures.delete(user, meta, id, q.rowVersion);
  }
}
