import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { ApprovalActSchema, BulkApproveSchema, DelegateSchema, type SessionUser } from '../../../../shared/index.js';
import { ReqMeta } from '../../../common/context/request-meta.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../core/application/ports/unit-of-work.js';
import { ApprovalsService } from '../application/approvals.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const CommentSchema = z.object({ comment: z.string().trim().min(1, 'Write a comment').max(1000) });

/**
 * /api/approvals: the Approvals Inbox. Open to every signed-in user: it lists only what they can act on or requested,
 * and every decision is checked against the current step's approvers.
 */
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('inbox')
  inbox(@CurrentUser() user: SessionUser) {
    return this.approvals.inbox(user);
  }

  @Post('bulk')
  @HttpCode(200)
  bulk(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(BulkApproveSchema)) body: z.infer<typeof BulkApproveSchema>) {
    return this.approvals.bulk(user, meta, body.ids, body.action, body.reason);
  }

  @Get(':id')
  detail(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.approvals.detail(user, id);
  }

  @Get(':id/delegates')
  delegates(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.approvals.delegates(user, id);
  }

  @Post(':id/delegate')
  @HttpCode(200)
  delegate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DelegateSchema)) body: z.infer<typeof DelegateSchema>) {
    return this.approvals.delegate(user, meta, id, body.userId, body.comment);
  }

  @Post(':id/comment')
  @HttpCode(200)
  comment(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CommentSchema)) body: z.infer<typeof CommentSchema>) {
    return this.approvals.comment(user, meta, id, body.comment);
  }

  @Post(':id/:action')
  @HttpCode(200)
  act(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', pipe(z.enum(['approve', 'reject', 'request-changes']))) action: 'approve' | 'reject' | 'request-changes', @Body(pipe(ApprovalActSchema)) body: z.infer<typeof ApprovalActSchema>) {
    return this.approvals.act(user, meta, id, action === 'request-changes' ? 'changes' : action, body);
  }
}
