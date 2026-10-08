import { Controller, Get, Param, ParseUUIDPipe, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import type { SessionUser } from '../../../../shared/index.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { AttachmentsService } from '../application/attachments.service.js';

/** GET /api/attachments/:id — the uploader, or users the owning module allows (permission-checked per entity type). */
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get(':id')
  async download(@CurrentUser() user: SessionUser, @Param('id', new ParseUUIDPipe()) id: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.attachments.download(user, id);
    res.setHeader('Content-Type', f.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${f.fileName.replace(/"/g, '')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(f.data);
  }
}
