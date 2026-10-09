import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { SalesOptionsService } from '../application/sales-options.service.js';

const uuid = new ParseUUIDPipe();

/** /api/sales/doc-options: customers, products, warehouses, tax codes… for quotations, orders, challans and invoices. */
@Controller('sales/doc-options')
export class SalesOptionsController {
  constructor(private readonly options: SalesOptionsService) {}

  @Get()
  get(@CurrentUser() user: SessionUser) {
    return this.options.options(user);
  }

  /** Product prices on a price list (effective today). */
  @Get('prices/:priceListId')
  prices(@CurrentUser() user: SessionUser, @Param('priceListId', uuid) priceListId: string) {
    return this.options.prices(user, priceListId);
  }

  /** The customer's credit limit, balance, open orders and what is still available. */
  @Get('credit/:customerId')
  credit(@CurrentUser() user: SessionUser, @Param('customerId', uuid) customerId: string) {
    return this.options.credit(user, customerId);
  }
}
