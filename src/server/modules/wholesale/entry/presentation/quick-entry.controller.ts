import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  HoldBillSchema, OrderTemplateInputSchema, OrderTemplateUpdateSchema, RowVersionSchema, WholesaleBillSchema,
  type OrderTemplateInput, type SessionUser, type WholesaleBillInput,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { OrderTemplatesService } from '../../templates/application/order-templates.service.js';
import { QuickEntryService } from '../application/quick-entry.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);
const canTemplates = (u: SessionUser) => {
  if (!u.permissions.includes('booking:create') && !u.permissions.includes('wsentry:create')) throw new ForbiddenException('You can’t manage order templates.');
};

/** /api/distribution/wholesale-options: routes, shops, tiers, products, schemes… for the wholesale screens. */
@Controller('distribution/wholesale-options')
export class WholesaleOptionsController {
  constructor(private readonly entry: QuickEntryService) {}

  @Get()
  get(@CurrentUser() user: SessionUser) {
    return this.entry.options(user);
  }

  /** Available stock per product in a warehouse. */
  @Get('stock/:warehouseId')
  stock(@CurrentUser() user: SessionUser, @Param('warehouseId', uuid) warehouseId: string) {
    return this.entry.stock(user, warehouseId);
  }
}

/** /api/distribution/quick-entry: Quick Wholesale Entry › Save (posts a WS invoice). */
@Controller('distribution/quick-entry')
export class QuickEntryController {
  constructor(private readonly entry: QuickEntryService) {}

  @Post()
  @RequirePermission('wsentry:create')
  save(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(WholesaleBillSchema)) body: WholesaleBillInput) {
    return this.entry.save(user, meta, body);
  }
}

/** /api/distribution/held-bills: bills parked from Quick Wholesale Entry. */
@Controller('distribution/held-bills')
export class HeldBillsController {
  constructor(private readonly entry: QuickEntryService) {}

  @Get()
  @RequirePermission('wsentry:view')
  list(@CurrentUser() user: SessionUser) {
    return this.entry.heldBills(user);
  }

  @Get(':id')
  @RequirePermission('wsentry:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.entry.held(user, id);
  }

  @Post()
  @RequirePermission('wsentry:create')
  hold(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(HoldBillSchema)) body: WholesaleBillInput & { holdReason?: string }) {
    return this.entry.hold(user, meta, body);
  }

  @Post(':id/recall')
  @HttpCode(200)
  @RequirePermission('wsentry:create')
  recall(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.entry.recall(user, meta, id);
  }

  @Post(':id/discard')
  @HttpCode(204)
  @RequirePermission('wsentry:delete')
  async discard(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    await this.entry.discard(user, meta, id);
  }
}

/** /api/distribution/order-templates: line sets for Quick Wholesale Entry and bookings (booking or wsentry create to manage). */
@Controller('distribution/order-templates')
export class OrderTemplatesController {
  constructor(private readonly templates: OrderTemplatesService) {}

  @Get()
  list(@CurrentUser() user: SessionUser, @Query('customer') customer?: string) {
    return this.templates.list(user, customer && /^[0-9a-f-]{36}$/i.test(customer) ? customer : null);
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.templates.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(OrderTemplateInputSchema)) body: OrderTemplateInput) {
    canTemplates(user);
    return this.templates.create(user, meta, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(OrderTemplateUpdateSchema)) body: OrderTemplateInput & { rowVersion: number }) {
    canTemplates(user);
    return this.templates.update(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async archive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    canTemplates(user);
    await this.templates.archive(user, meta, id, q.rowVersion);
  }
}
