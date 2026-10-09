import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  PerfActionItemsSchema, PerfCalibrateSchema, PerfCheckInSchema, PerfFeedbackAnswerSchema, PerfFeedbackGiveSchema, PerfFeedbackQuerySchema, PerfFeedbackRequestSchema,
  PerfGenerateSchema, PerfGoalCreateSchema, PerfGoalQuerySchema, PerfGoalUpdateSchema, PerfManagerReviewSchema, PerfMyGoalCreateSchema, PerfMyOneOnOneSchema,
  PerfOneOnOneCreateSchema, PerfOneOnOneQuerySchema, PerfOneOnOneUpdateSchema, PerfReviewQuerySchema, PerfSelfReviewSchema, RowVersionSchema,
  type PerfCalibrate, type PerfCheckIn, type PerfFeedbackAnswer, type PerfFeedbackGive, type PerfFeedbackRequest, type PerfGoalCreate, type PerfGoalUpdate,
  type PerfManagerReview, type PerfMyGoalCreate, type PerfMyOneOnOne, type PerfOneOnOneCreate, type PerfOneOnOneUpdate, type PerfReviewQuery, type PerfSelfReview,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { PerformanceService } from '../application/performance.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr/performance: reviews of a cycle (board), goals & key results, feedback and 1:1s. There are no perf:* permissions: emp:* applies. */
@Controller('hr/performance')
export class PerformanceController {
  constructor(private readonly perf: PerformanceService) {}

  @Get('reviews')
  @RequirePermission('emp:view')
  board(@CurrentUser() user: SessionUser, @Query(pipe(PerfReviewQuerySchema)) q: PerfReviewQuery) {
    return this.perf.board(user, q);
  }

  @Get('options')
  @RequirePermission('emp:view')
  options(@CurrentUser() user: SessionUser) {
    return this.perf.options(user);
  }

  /** One review per eligible employee of the (active) cycle; existing reviews are kept. */
  @Post('reviews/generate')
  @HttpCode(200)
  @RequirePermission('emp:create')
  generate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PerfGenerateSchema)) body: { cycleId: string }) {
    return this.perf.generate(user, meta, body.cycleId);
  }

  @Get('reviews/:id')
  @RequirePermission('emp:view')
  review(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.perf.review(user, id);
  }

  @Post('reviews/:id/manager')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  manager(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PerfManagerReviewSchema)) body: PerfManagerReview) {
    return this.perf.managerReview(user, meta, id, body);
  }

  @Post('reviews/:id/calibrate')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  calibrate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PerfCalibrateSchema)) body: PerfCalibrate) {
    return this.perf.calibrate(user, meta, id, body);
  }

  @Post('reviews/:id/sign-off')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  signOff(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.perf.signOff(user, meta, id, body.rowVersion);
  }

  @Get('goals')
  @RequirePermission('emp:view')
  goals(@CurrentUser() user: SessionUser, @Query(pipe(PerfGoalQuerySchema)) q: { employeeId?: string; cycleId?: string }) {
    return this.perf.goals(user, q);
  }

  @Post('goals')
  @RequirePermission('emp:create')
  createGoal(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PerfGoalCreateSchema)) body: PerfGoalCreate) {
    return this.perf.createGoal(user, meta, body);
  }

  @Patch('goals/:id')
  @RequirePermission('emp:edit')
  updateGoal(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PerfGoalUpdateSchema)) body: PerfGoalUpdate) {
    return this.perf.updateGoal(user, meta, id, body);
  }

  @Delete('goals/:id')
  @HttpCode(204)
  @RequirePermission('emp:delete')
  async deleteGoal(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.perf.deleteGoal(user, meta, id, q.rowVersion);
  }

  @Get('feedback')
  @RequirePermission('emp:view')
  feedback(@CurrentUser() user: SessionUser, @Query(pipe(PerfFeedbackQuerySchema)) q: { employeeId?: string }) {
    return this.perf.feedback(user, q);
  }

  @Post('feedback/request')
  @RequirePermission('emp:edit')
  request(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PerfFeedbackRequestSchema)) body: PerfFeedbackRequest) {
    return this.perf.requestFeedback(user, meta, body);
  }

  @Post('feedback')
  @RequirePermission('emp:edit')
  give(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PerfFeedbackGiveSchema)) body: PerfFeedbackGive) {
    return this.perf.giveFeedback(user, meta, body);
  }

  @Post('feedback/:id/answer')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  answer(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PerfFeedbackAnswerSchema)) body: PerfFeedbackAnswer) {
    return this.perf.answerFeedback(user, meta, id, body);
  }

  @Get('one-on-ones')
  @RequirePermission('emp:view')
  oneOnOnes(@CurrentUser() user: SessionUser, @Query(pipe(PerfOneOnOneQuerySchema)) q: { employeeId?: string }) {
    return this.perf.oneOnOnes(user, q.employeeId);
  }

  @Post('one-on-ones')
  @RequirePermission('emp:create')
  createOneOnOne(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PerfOneOnOneCreateSchema)) body: PerfOneOnOneCreate) {
    return this.perf.createOneOnOne(user, meta, body);
  }

  @Patch('one-on-ones/:id')
  @RequirePermission('emp:edit')
  updateOneOnOne(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PerfOneOnOneUpdateSchema)) body: PerfOneOnOneUpdate) {
    return this.perf.updateOneOnOne(user, meta, id, body);
  }

  @Delete('one-on-ones/:id')
  @HttpCode(204)
  @RequirePermission('emp:delete')
  async deleteOneOnOne(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.perf.deleteOneOnOne(user, meta, id, q.rowVersion);
  }
}

/** /api/me/goals, /api/me/reviews, /api/me/feedback, /api/me/one-on-ones: My Profile › Goals & Reviews (own data only). */
@Controller('me')
export class MyGoalsController {
  constructor(private readonly perf: PerformanceService) {}

  @Get('goals')
  @RequirePermission('mygoal:view')
  mine(@CurrentUser() user: SessionUser) {
    return this.perf.myGoals(user);
  }

  @Post('goals')
  @RequirePermission('mygoal:edit')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PerfMyGoalCreateSchema)) body: PerfMyGoalCreate) {
    return this.perf.createMyGoal(user, meta, body);
  }

  @Patch('goals/:id')
  @RequirePermission('mygoal:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PerfGoalUpdateSchema)) body: PerfGoalUpdate) {
    return this.perf.updateMyGoal(user, meta, id, body);
  }

  @Post('goals/check-in')
  @HttpCode(200)
  @RequirePermission('mygoal:edit')
  checkIn(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PerfCheckInSchema)) body: PerfCheckIn) {
    return this.perf.checkIn(user, meta, body);
  }

  @Get('reviews/:id')
  @RequirePermission('mygoal:view')
  review(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.perf.myReview(user, id);
  }

  @Post('reviews/:id/self')
  @HttpCode(200)
  @RequirePermission('mygoal:edit')
  self(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PerfSelfReviewSchema)) body: PerfSelfReview) {
    return this.perf.selfReview(user, meta, id, body);
  }

  /** The reviewing manager submits the manager review of a direct report. */
  @Post('reviews/:id/manager')
  @HttpCode(200)
  @RequirePermission('mygoal:edit')
  manager(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PerfManagerReviewSchema)) body: PerfManagerReview) {
    return this.perf.myManagerReview(user, meta, id, body);
  }

  @Post('feedback/request')
  @HttpCode(200)
  @RequirePermission('mygoal:edit')
  request(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PerfFeedbackRequestSchema)) body: PerfFeedbackRequest) {
    return this.perf.myFeedbackRequest(user, meta, body);
  }

  @Post('feedback')
  @HttpCode(200)
  @RequirePermission('mygoal:edit')
  give(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PerfFeedbackGiveSchema)) body: PerfFeedbackGive) {
    return this.perf.myFeedbackGive(user, meta, body);
  }

  @Post('feedback/:id/answer')
  @HttpCode(200)
  @RequirePermission('mygoal:edit')
  answer(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PerfFeedbackAnswerSchema)) body: PerfFeedbackAnswer) {
    return this.perf.myFeedbackAnswer(user, meta, id, body);
  }

  @Post('one-on-ones')
  @HttpCode(200)
  @RequirePermission('mygoal:edit')
  oneOnOne(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PerfMyOneOnOneSchema)) body: PerfMyOneOnOne) {
    return this.perf.myOneOnOne(user, meta, body);
  }

  @Patch('one-on-ones/:id/actions')
  @RequirePermission('mygoal:edit')
  actions(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PerfActionItemsSchema)) body: { actionItems: { text: string; done: boolean }[]; rowVersion: number }) {
    return this.perf.myActionItems(user, meta, id, body);
  }
}
