import { Controller, HttpCode, Post } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { TaxMasterImportService } from '../application/tax-master-import.service.js';

/** POST /api/tax/codes/import-master: Tax › Tax Codes › "Import from Tax Master" (Phase 37). */
@Controller('tax/codes')
export class TaxMasterImportController {
  constructor(private readonly imports: TaxMasterImportService) {}

  @Post('import-master')
  @HttpCode(200)
  @RequirePermission('tax:create')
  importMaster(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.imports.importMaster(user, meta);
  }
}
