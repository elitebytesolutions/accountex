import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {
  BackupSettingsSchema, ImportRowsSchema, ImportRunSchema, ImportStartSchema, RestoreRequestSchema, TenantWebhookInputSchema, TenantWebhookUpdateSchema,
  type BackupSettingsInput, type ImportStart, type SessionUser, type TenantWebhookInput,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ValidationError } from '../../../../core/domain/errors.js';
import { BackupsService } from '../../backups/application/backups.service.js';
import { IntegrationsService } from '../../integrations/application/integrations.service.js';
import { DataImportsService } from '../application/data-imports.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const PROVIDER = /^[A-Z0-9_]{2,40}$/;

/** /api/imports: Settings › Data Import (customers, vendors, items through their own use cases). */
@Controller('imports')
export class DataImportsController {
  constructor(private readonly imports: DataImportsService) {}

  @Get()
  @RequirePermission('bak:view')
  list(@CurrentUser() user: SessionUser) {
    return this.imports.list(user);
  }

  @Get(':id')
  @RequirePermission('bak:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.imports.get(user, id);
  }

  /** Upload + map: the job with its column map and row count. */
  @Post()
  @RequirePermission('bak:create')
  start(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(ImportStartSchema)) body: ImportStart) {
    return this.imports.start(user, meta, body);
  }

  @Post(':id/validate')
  @HttpCode(200)
  @RequirePermission('bak:create')
  validate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ImportRowsSchema)) body: { rows: Record<string, string>[] }) {
    return this.imports.validate(user, meta, id, body.rows);
  }

  @Post(':id/run')
  @HttpCode(200)
  @RequirePermission('bak:create')
  run(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ImportRunSchema)) body: { rows: Record<string, string>[]; skipErrorRows: boolean }) {
    return this.imports.run(user, meta, id, body.rows, body.skipErrorRows);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('bak:create')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.imports.cancel(user, meta, id);
  }

  @Get(':id/errors.csv')
  @RequirePermission('bak:export')
  @Header('content-type', 'text/csv; charset=utf-8')
  async errors(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string, @Res() res: Response) {
    const f = await this.imports.errorsCsv(user, id);
    res.setHeader('content-disposition', `attachment; filename="${f.fileName}"`);
    res.send(f.csv);
  }
}

/** /api/settings/integrations: Settings › Integrations (API keys read-only: issued by the Super Admin). */
@Controller('settings/integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @RequirePermission('intg:view')
  overview(@CurrentUser() user: SessionUser) {
    return this.integrations.overview(user);
  }

  @Post('providers/:provider/:action')
  @HttpCode(200)
  @RequirePermission('intg:edit')
  connect(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('provider') provider: string, @Param('action') action: string) {
    if (!PROVIDER.test(provider) || !['connect', 'disconnect'].includes(action)) throw new ValidationError('Unknown integration action', { action: ['connect or disconnect'] });
    return this.integrations.setConnection(user, meta, provider, action === 'connect');
  }

  /** The signing secret is returned once, in this response only. */
  @Post('webhooks')
  @RequirePermission('intg:create')
  createWebhook(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(TenantWebhookInputSchema)) body: TenantWebhookInput) {
    return this.integrations.createWebhook(user, meta, body);
  }

  @Patch('webhooks/:id')
  @RequirePermission('intg:edit')
  updateWebhook(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TenantWebhookUpdateSchema)) body: TenantWebhookInput & { rowVersion: number }) {
    return this.integrations.updateWebhook(user, meta, id, body);
  }

  @Delete('webhooks/:id')
  @HttpCode(204)
  @RequirePermission('intg:delete')
  async deleteWebhook(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    await this.integrations.deleteWebhook(user, meta, id);
  }

  @Get('webhooks/:id/deliveries')
  @RequirePermission('intg:view')
  deliveries(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.integrations.deliveries(user, id);
  }

  @Post('webhooks/:id/test')
  @HttpCode(200)
  @RequirePermission('intg:edit')
  test(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.integrations.test(user, meta, id);
  }

  @Post('webhooks/deliveries/:id/redeliver')
  @HttpCode(200)
  @RequirePermission('intg:edit')
  redeliver(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.integrations.redeliver(user, meta, id);
  }
}

/** /api/settings/backups: Settings › Backup & Restore. */
@Controller('settings/backups')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  @RequirePermission('bak:view')
  overview(@CurrentUser() user: SessionUser) {
    return this.backups.overview(user);
  }

  @Put('settings')
  @RequirePermission('bak:create')
  settings(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(BackupSettingsSchema)) body: BackupSettingsInput) {
    return this.backups.saveSettings(user, meta, body);
  }

  @Post('run')
  @HttpCode(202)
  @RequirePermission('bak:create')
  run(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.backups.run(user, meta);
  }

  @Get(':id/download')
  @RequirePermission('bak:export')
  async download(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string, @Res() res: Response) {
    const f = await this.backups.download(user, id);
    res.setHeader('content-type', 'application/json');
    res.setHeader('content-disposition', `attachment; filename="${f.fileName}"`);
    res.send(f.data);
  }

  /** Needs the company code typed to confirm; carried out by Accountex support. */
  @Post(':id/restore-request')
  @RequirePermission('bak:create')
  restore(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RestoreRequestSchema)) body: { reason: string; confirmText: string; takeSafetyBackup: boolean }) {
    return this.backups.requestRestore(user, meta, id, body);
  }

  @Post('restore-requests/:id/cancel')
  @HttpCode(200)
  @RequirePermission('bak:create')
  cancelRestore(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.backups.cancelRestore(user, meta, id);
  }
}
