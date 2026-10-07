import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { SETTINGS_SECTIONS, settingsSectionBody, type SessionUser, type SettingsSection } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { NotFoundError } from '../../../../core/domain/errors.js';
import { CompanySettingsService } from '../application/company-settings.service.js';

/** /api/settings/company: Settings tabs Profile, Finance, Sales & purchases, HR, Tax, Branding. */
@Controller('settings/company')
export class CompanySettingsController {
  constructor(private readonly settings: CompanySettingsService) {}

  @Get()
  @RequirePermission('comp:view')
  get(@CurrentUser() user: SessionUser) {
    return this.settings.get(user);
  }

  @Put(':section')
  @RequirePermission('comp:edit')
  save(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('section') section: string, @Body() body: unknown) {
    if (!Object.hasOwn(SETTINGS_SECTIONS, section)) throw new NotFoundError(`Unknown settings section ${section}`);
    const s = section as SettingsSection;
    const input = new ZodValidationPipe(settingsSectionBody(s)).transform(body) as Record<string, unknown> & { rowVersion?: number };
    return this.settings.saveSection(user, meta, s, input);
  }
}
