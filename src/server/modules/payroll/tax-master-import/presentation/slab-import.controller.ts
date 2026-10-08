import { Body, Controller, Post } from '@nestjs/common';
import { TaxSlabImportSchema, type SessionUser, type TaxSlabImport } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { SlabImportService } from '../application/slab-import.service.js';

/** POST /api/payroll/tax-slabs/import-master: Salary Structures › Tax slabs › "Import from Tax Master" (Phase 37). */
@Controller('payroll')
export class SlabImportController {
  constructor(private readonly imports: SlabImportService) {}

  @Post('tax-slabs/import-master')
  @RequirePermission('prun:edit')
  importMaster(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(TaxSlabImportSchema)) body: TaxSlabImport) {
    return this.imports.importMaster(user, meta, body.taxYear);
  }
}
