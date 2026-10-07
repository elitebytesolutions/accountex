import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { RowVersionSchema, type SessionUser } from '../../../../../shared/index.js';
import {
  HelpdeskCategoryCreateSchema, HelpdeskCategoryUpdateSchema, HelpdeskFaqCreateSchema, HelpdeskFaqUpdateSchema,
  type HelpdeskCategoryCreate, type HelpdeskCategoryUpdate, type HelpdeskFaqCreate, type HelpdeskFaqUpdate,
} from '../../../../../shared/self-service/helpdesk.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { HelpdeskSetupService } from '../application/helpdesk-setup.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const toggle = pipe(z.enum(['activate', 'deactivate']));

/** /api/helpdesk: Workforce › Employee engagement › Helpdesk setup (HR staff, emp:*). */
@Controller('helpdesk')
export class HelpdeskController {
  constructor(private readonly helpdesk: HelpdeskSetupService) {}

  @Get('categories')
  @RequirePermission('emp:view')
  categories(@CurrentUser() user: SessionUser) {
    return this.helpdesk.categories(user);
  }

  @Post('categories')
  @RequirePermission('emp:create')
  createCategory(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(HelpdeskCategoryCreateSchema)) body: HelpdeskCategoryCreate) {
    return this.helpdesk.createCategory(user, meta, body);
  }

  @Patch('categories/:id')
  @RequirePermission('emp:edit')
  updateCategory(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(HelpdeskCategoryUpdateSchema)) body: HelpdeskCategoryUpdate) {
    return this.helpdesk.updateCategory(user, meta, id, body);
  }

  @Post('categories/:id/:action')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  setCategoryActive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', toggle) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.helpdesk.setCategoryActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete('categories/:id')
  @HttpCode(204)
  @RequirePermission('emp:delete')
  async deleteCategory(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.helpdesk.deleteCategory(user, meta, id, q.rowVersion);
  }

  @Get('faqs')
  @RequirePermission('emp:view')
  faqs(@CurrentUser() user: SessionUser) {
    return this.helpdesk.faqs(user);
  }

  @Post('faqs')
  @RequirePermission('emp:create')
  createFaq(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(HelpdeskFaqCreateSchema)) body: HelpdeskFaqCreate) {
    return this.helpdesk.createFaq(user, meta, body);
  }

  @Patch('faqs/:id')
  @RequirePermission('emp:edit')
  updateFaq(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(HelpdeskFaqUpdateSchema)) body: HelpdeskFaqUpdate) {
    return this.helpdesk.updateFaq(user, meta, id, body);
  }

  /** activate = publish the answer to employees, deactivate = hide it. */
  @Post('faqs/:id/:action')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  setFaqPublished(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', toggle) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.helpdesk.setFaqPublished(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete('faqs/:id')
  @HttpCode(204)
  @RequirePermission('emp:delete')
  async deleteFaq(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.helpdesk.deleteFaq(user, meta, id, q.rowVersion);
  }
}

/** /api/me/helpdesk: My Profile › Helpdesk (every employee, myhelp:view). */
@Controller('me/helpdesk')
export class MyHelpdeskController {
  constructor(private readonly helpdesk: HelpdeskSetupService) {}

  @Get()
  @RequirePermission('myhelp:view')
  mine(@CurrentUser() user: SessionUser) {
    return this.helpdesk.mine(user);
  }
}
