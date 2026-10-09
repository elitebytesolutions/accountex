import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { EmployeeLetterCodeSchema, EmployeeLetterCreateSchema, EmployeeLetterVoidSchema, type EmployeeLetterCreate, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { EmployeeLettersService } from '../application/letters.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr: employee letters (Phase 33) on the employee view's Documents tab. The PDF downloads from /api/attachments/:id. */
@Controller('hr')
export class EmployeeLettersController {
  constructor(private readonly letters: EmployeeLettersService) {}

  @Get('letters/options')
  @RequirePermission('emp:view')
  options(@CurrentUser() user: SessionUser) {
    return this.letters.options(user);
  }

  @Get('employees/:id/letters')
  @RequirePermission('emp:view')
  list(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.letters.list(user, id);
  }

  /** Generates the English PDF, stores it and issues the letter (409 EMPLOYEE_LETTER_NO_TEMPLATE without a template). */
  @Post('employees/:id/letters')
  @RequirePermission('emp:edit')
  generate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(EmployeeLetterCreateSchema)) body: EmployeeLetterCreate) {
    return this.letters.generate(user, meta, id, body);
  }

  @Post('letters/:id/void')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  void(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(EmployeeLetterVoidSchema)) body: { reason: string }) {
    return this.letters.void(user, meta, id, body.reason);
  }
}

/** /api/letters/verify/:code: public check of a letter's verification code (no sign-in). */
@Controller('letters')
export class LetterVerificationController {
  constructor(private readonly letters: EmployeeLettersService) {}

  @Public()
  @Get('verify/:code')
  verify(@Param('code', pipe(EmployeeLetterCodeSchema)) code: string) {
    return this.letters.verify(code);
  }
}
