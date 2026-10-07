import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { DeviceCreateSchema, DeviceUpdateSchema, RowVersionSchema, type DeviceCreate, type DeviceUpdate, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { DevicesService } from '../application/devices.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr/devices: Workforce › Time & Attendance › Biometric Devices. No sync endpoint yet (no device connector before attendance). */
@Controller('hr/devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @RequirePermission('att:view')
  list(@CurrentUser() user: SessionUser) {
    return this.devices.list(user);
  }

  @Get('sync-logs')
  @RequirePermission('att:view')
  logs(@CurrentUser() user: SessionUser, @Query(pipe(z.object({ device: z.uuid().optional() }))) q: { device?: string }) {
    return this.devices.logs(user, q.device);
  }

  @Post()
  @RequirePermission('att:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(DeviceCreateSchema)) body: DeviceCreate) {
    return this.devices.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('att:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DeviceUpdateSchema)) body: DeviceUpdate) {
    return this.devices.update(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('att:edit')
  action(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', pipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.devices.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('att:approve')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.devices.delete(user, meta, id, q.rowVersion);
  }
}
