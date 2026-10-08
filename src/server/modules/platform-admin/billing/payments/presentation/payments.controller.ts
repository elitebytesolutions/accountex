import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { PaymentRefundSchema, type AdminSession, type PaymentRefund } from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { PaymentsService } from '../application/payments.service.js';

/** /api/admin/payments: refunds of recorded platform payments (Phase 41). Payments are recorded on the invoice. */
@AdminRoute()
@Controller('admin/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':id/refund')
  @HttpCode(200)
  refund(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(PaymentRefundSchema)) body: PaymentRefund) {
    return this.payments.refund(admin, meta, id, body);
  }
}
