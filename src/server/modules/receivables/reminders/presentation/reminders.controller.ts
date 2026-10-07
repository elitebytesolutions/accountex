import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  ReminderPreviewSchema, ReminderRuleCreateSchema, ReminderRuleUpdateSchema, ReminderTemplateCreateSchema, ReminderTemplateUpdateSchema, RowVersionSchema,
  type ReminderPreviewInput, type ReminderRuleCreate, type ReminderRuleUpdate, type ReminderTemplateCreate, type ReminderTemplateUpdate, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { RemindersService } from '../application/reminders.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/receivables/reminder-templates and /reminder-rules: Receivables › Payment Reminders. Setup changes need rcpt:edit. */
@Controller('receivables')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get('reminder-templates')
  @RequirePermission('rcpt:view')
  templates(@CurrentUser() user: SessionUser) {
    return this.reminders.templates(user);
  }

  @Post('reminder-templates')
  @RequirePermission('rcpt:edit')
  createTemplate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(ReminderTemplateCreateSchema)) body: ReminderTemplateCreate) {
    return this.reminders.createTemplate(user, meta, body);
  }

  @Patch('reminder-templates/:id')
  @RequirePermission('rcpt:edit')
  updateTemplate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ReminderTemplateUpdateSchema)) body: ReminderTemplateUpdate) {
    return this.reminders.updateTemplate(user, meta, id, body);
  }

  @Delete('reminder-templates/:id')
  @HttpCode(204)
  @RequirePermission('rcpt:delete')
  async deleteTemplate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.reminders.deleteTemplate(user, meta, id, q.rowVersion);
  }

  @Post('reminder-templates/:id/preview')
  @HttpCode(200)
  @RequirePermission('rcpt:view')
  preview(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string, @Body(pipe(ReminderPreviewSchema)) body: ReminderPreviewInput) {
    return this.reminders.preview(user, id, body);
  }

  @Get('reminder-rules')
  @RequirePermission('rcpt:view')
  rules(@CurrentUser() user: SessionUser) {
    return this.reminders.rules(user);
  }

  @Post('reminder-rules')
  @RequirePermission('rcpt:edit')
  createRule(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(ReminderRuleCreateSchema)) body: ReminderRuleCreate) {
    return this.reminders.createRule(user, meta, body);
  }

  @Patch('reminder-rules/:id')
  @RequirePermission('rcpt:edit')
  updateRule(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ReminderRuleUpdateSchema)) body: ReminderRuleUpdate) {
    return this.reminders.updateRule(user, meta, id, body);
  }

  @Post('reminder-rules/:id/:action')
  @HttpCode(200)
  @RequirePermission('rcpt:edit')
  setActive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', pipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.reminders.setRuleActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete('reminder-rules/:id')
  @HttpCode(204)
  @RequirePermission('rcpt:delete')
  async deleteRule(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.reminders.deleteRule(user, meta, id, q.rowVersion);
  }
}
