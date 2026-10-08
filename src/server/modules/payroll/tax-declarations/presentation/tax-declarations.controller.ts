import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { PROOF_MAX_BYTES, TaxDeclarationInputSchema, TaxDeclarationRejectSchema, type SessionUser, type TaxDeclarationInput } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ValidationError } from '../../../../core/domain/errors.js';
import { TaxDeclarationsService } from '../application/tax-declarations.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const QuerySchema = z.object({
  status: z.string().trim().max(20).optional(), taxYear: z.string().regex(/^\d{4}-\d{2}$/).optional(), search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
/** multer's in-memory file (no @types/multer in the project). */
type MulterFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };
// one byte over the limit so multer stops reading, and the service answers ATTACHMENT_TOO_LARGE
const upload = FileInterceptor('file', { limits: { fileSize: PROOF_MAX_BYTES + 1, files: 1 } });

/** /api/payroll/tax-declarations: payroll staff review declarations (proof required). */
@Controller('payroll/tax-declarations')
export class TaxDeclarationsController {
  constructor(private readonly declarations: TaxDeclarationsService) {}

  @Get()
  @RequirePermission('prun:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(QuerySchema)) q: z.infer<typeof QuerySchema>) {
    return this.declarations.list(user, q);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('prun:approve')
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.declarations.approve(user, meta, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('prun:approve')
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TaxDeclarationRejectSchema)) body: { reason: string }) {
    return this.declarations.reject(user, meta, id, body.reason);
  }
}

/** /api/me/tax-declarations: My Profile › Tax (projection, own declarations, proof upload). */
@Controller('me/tax-declarations')
export class MyTaxDeclarationsController {
  constructor(private readonly declarations: TaxDeclarationsService) {}

  @Get()
  @RequirePermission('mytax:view')
  view(@CurrentUser() user: SessionUser) {
    return this.declarations.myView(user);
  }

  @Post()
  @HttpCode(200)
  @RequirePermission('mytax:create')
  declare(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(TaxDeclarationInputSchema)) body: TaxDeclarationInput) {
    return this.declarations.myDeclare(user, meta, body);
  }

  @Post(':id/proof')
  @HttpCode(200)
  @RequirePermission('mytax:edit')
  @UseInterceptors(upload)
  proof(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @UploadedFile() file: MulterFile | undefined) {
    if (!file) throw new ValidationError('Choose a file to upload', { file: ['Required'] });
    return this.declarations.myProof(user, meta, id, { originalName: file.originalname, mimeType: file.mimetype, size: file.size, buffer: file.buffer });
  }
}
