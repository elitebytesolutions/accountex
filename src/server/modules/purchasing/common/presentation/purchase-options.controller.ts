import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { PurchaseOptionsService } from '../application/purchase-options.service.js';

/** /api/purchases/options: vendors, products, warehouses, tax codes… for the purchasing screens; /api/purchases/item-insight/:id for the voucher's side panel. */
@Controller('purchases')
export class PurchaseOptionsController {
  constructor(private readonly options: PurchaseOptionsService) {}

  @Get('options')
  get(@CurrentUser() user: SessionUser) {
    return this.options.options(user);
  }

  @Get('item-insight/:id')
  itemInsight(@CurrentUser() user: SessionUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.options.itemInsight(user, id);
  }
}
