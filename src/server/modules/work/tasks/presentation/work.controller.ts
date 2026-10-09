import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  NotificationPreferencesSchema, NotificationQuerySchema, ReadAllSchema, RowVersionSchema, TaskInputSchema, TaskQuerySchema,
  type NotificationPreferences, type NotificationQuery, type SessionUser, type TaskInput, type TaskQuery,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { DashboardService } from '../../dashboard/application/dashboard.service.js';
import { NotificationsService } from '../../notifications/application/notifications.service.js';
import { TasksService } from '../application/tasks.service.js';

const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const uuid = new ParseUUIDPipe();
const TaskUpdate = TaskInputSchema.extend({ rowVersion: z.coerce.number().int().min(0) });
const StatusBody = z.object({ rowVersion: z.coerce.number().int().min(0), status: z.enum(['IN_PROGRESS', 'PENDING', 'CANCELLED']) });
const ReadBody = z.object({ ids: z.array(z.uuid()).min(1).max(200) });

/**
 * /api/work: Today's Work and my tasks, plus the workspace dashboard. Every signed-in user has these (own data only),
 * so no permission is required.
 */
@Controller('work')
export class WorkController {
  constructor(private readonly tasks: TasksService, private readonly dashboard: DashboardService) {}

  @Get('today')
  today(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.tasks.today(user, meta);
  }

  @Get('dashboard')
  dash(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.dashboard.get(user, meta);
  }

  /** Active users a task can be given to. */
  @Get('users')
  users(@CurrentUser() user: SessionUser) {
    return this.tasks.users(user);
  }

  @Get('tasks')
  list(@CurrentUser() user: SessionUser, @Query(pipe(TaskQuerySchema)) q: TaskQuery) {
    return this.tasks.list(user, q);
  }

  @Post('tasks')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(TaskInputSchema)) body: TaskInput) {
    return this.tasks.create(user, meta, body);
  }

  @Get('tasks/:id')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.tasks.get(user, id);
  }

  @Patch('tasks/:id')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TaskUpdate)) body: TaskInput & { rowVersion: number }) {
    return this.tasks.update(user, meta, id, body);
  }

  @Post('tasks/:id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RowVersionSchema)) body: { rowVersion: number }) {
    return this.tasks.complete(user, meta, id, body.rowVersion);
  }

  /** Start (IN_PROGRESS), back to pending, or cancel. */
  @Post('tasks/:id/status')
  @HttpCode(200)
  status(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(StatusBody)) body: { rowVersion: number; status: 'IN_PROGRESS' | 'PENDING' | 'CANCELLED' }) {
    return this.tasks.setStatus(user, meta, id, body.rowVersion, body.status);
  }

  @Delete('tasks/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(pipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.tasks.remove(user, meta, id, q.rowVersion);
  }
}

/** /api/me/notifications: the signed-in user's own notifications and preferences. */
@Controller('me')
export class MyNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  list(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Query(pipe(NotificationQuerySchema)) q: NotificationQuery) {
    return this.notifications.list(user, meta, q);
  }

  /** Header bell: unread count and the latest unread. */
  @Get('notifications/bell')
  bell(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.notifications.bell(user, meta);
  }

  @Post('notifications/read')
  @HttpCode(200)
  read(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(ReadBody)) body: { ids: string[] }) {
    return this.notifications.read(user, meta, body.ids);
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(ReadAllSchema)) body: { category?: string | null }) {
    return this.notifications.readAll(user, meta, body.category ?? null);
  }

  @Post('notifications/:id/archive')
  @HttpCode(204)
  async archive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    await this.notifications.archive(user, meta, id);
  }

  @Get('notification-preferences')
  preferences(@CurrentUser() user: SessionUser) {
    return this.notifications.preferences(user);
  }

  @Patch('notification-preferences')
  save(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(NotificationPreferencesSchema)) body: NotificationPreferences) {
    return this.notifications.savePreferences(user, meta, body);
  }
}
