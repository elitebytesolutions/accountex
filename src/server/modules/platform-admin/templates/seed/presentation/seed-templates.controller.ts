import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  HistoryQuerySchema, RoleGrantsSaveSchema, RowVersionSchema, SeedLeaveTypeCreateSchema, SeedLeaveTypeUpdateSchema, SeedListKindSchema,
  SeedSalaryComponentCreateSchema, SeedSalaryComponentUpdateSchema, SeedTaxCodeCreateSchema, SeedTaxCodeUpdateSchema,
  type AdminSession, type HistoryQuery, type RoleGrantsSave, type SeedListKind,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { RoleGrantsService } from '../application/role-grants.service.js';
import { SeedTemplatesService } from '../application/seed-templates.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const kindPipe = pipe(SeedListKindSchema);
const systemKey = pipe(z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Unknown system role'));

const CREATE = { 'leave-types': SeedLeaveTypeCreateSchema, 'salary-components': SeedSalaryComponentCreateSchema, 'tax-codes': SeedTaxCodeCreateSchema } as const;
const UPDATE = { 'leave-types': SeedLeaveTypeUpdateSchema, 'salary-components': SeedSalaryComponentUpdateSchema, 'tax-codes': SeedTaxCodeUpdateSchema } as const;

/** Validates a body with the schema of the list in the path (the body pipe can't see the :kind param). */
function parse<K extends SeedListKind, S extends Record<SeedListKind, z.ZodType>>(schemas: S, kind: K, body: unknown): z.output<S[K]> {
  return new ZodValidationPipe(schemas[kind]).transform(body) as z.output<S[K]>;
}

/**
 * /api/admin/seed: Templates › Master seed lists (leave types, salary components, tax codes) and the default grants
 * of each system role (role × permission matrix; affects companies created afterwards).
 */
@AdminRoute()
@Controller('admin/seed')
export class SeedTemplatesController {
  constructor(
    private readonly seeds: SeedTemplatesService,
    private readonly grants: RoleGrantsService,
  ) {}

  @Get('role-grants')
  matrix() {
    return this.grants.matrix();
  }

  @Put('role-grants/:systemKey')
  saveGrants(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('systemKey', systemKey) key: string, @Body(pipe(RoleGrantsSaveSchema)) body: RoleGrantsSave) {
    return this.grants.save(admin, meta, key, body.permissions);
  }

  @Get('role-grants/:systemKey/history')
  grantHistory(@Param('systemKey', systemKey) key: string, @Query(pipe(HistoryQuerySchema)) query: HistoryQuery) {
    return this.grants.history(key, query);
  }

  @Get(':kind')
  list(@Param('kind', kindPipe) kind: SeedListKind) {
    return this.seeds.list(kind);
  }

  @Get(':kind/:id')
  get(@Param('kind', kindPipe) kind: SeedListKind, @Param('id', uuid) id: string) {
    return this.seeds.get(kind, id);
  }

  @Post(':kind')
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('kind', kindPipe) kind: SeedListKind, @Body() body: unknown) {
    return this.seeds.create(admin, meta, kind, parse(CREATE, kind, body));
  }

  @Patch(':kind/:id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('kind', kindPipe) kind: SeedListKind, @Param('id', uuid) id: string, @Body() body: unknown) {
    return this.seeds.update(admin, meta, kind, id, parse(UPDATE, kind, body));
  }

  @Delete(':kind/:id')
  @HttpCode(204)
  async delete(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('kind', kindPipe) kind: SeedListKind, @Param('id', uuid) id: string, @Query(pipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.seeds.delete(admin, meta, kind, id, q.rowVersion);
  }
}
