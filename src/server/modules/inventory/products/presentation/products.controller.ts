import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  ProductBarcodeCreateSchema,
  ProductBarcodeUpdateSchema,
  ProductCreateSchema,
  ProductListQuerySchema,
  ProductPriceSchema,
  ProductSupplierCreateSchema,
  ProductSupplierUpdateSchema,
  ProductUnitCreateSchema,
  ProductUnitUpdateSchema,
  ProductUpdateSchema,
  RowVersionSchema,
  type ProductBarcodeCreate,
  type ProductBarcodeUpdate,
  type ProductCreate,
  type ProductListQuery,
  type ProductPriceChange,
  type ProductSupplierCreate,
  type ProductSupplierUpdate,
  type ProductUnitCreate,
  type ProductUnitUpdate,
  type ProductUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ProductsService } from '../application/products.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
type Meta = RequestMeta;

/** /api/inventory/products (+ units, barcodes, suppliers, price log, lookup): Inventory › Products › Product Catalogue. */
@Controller('inventory')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('products')
  @RequirePermission('item:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(ProductListQuerySchema)) q: ProductListQuery) {
    return this.products.list(user, q);
  }

  @Get('products/summary')
  @RequirePermission('item:view')
  summary(@CurrentUser() user: SessionUser) {
    return this.products.summary(user);
  }

  @Get('products/form-options')
  @RequirePermission('item:view')
  formOptions(@CurrentUser() user: SessionUser) {
    return this.products.formOptions(user);
  }

  @Get('products/next-sku')
  @RequirePermission('item:view')
  async nextSku(@CurrentUser() user: SessionUser, @Query(pipe(z.object({ prefix: z.string().trim().max(10).default('SKU') }))) q: { prefix: string }) {
    return { sku: await this.products.nextSku(user, q.prefix) };
  }

  @Get('products/lookup')
  @RequirePermission('item:view')
  lookup(@CurrentUser() user: SessionUser, @Query(pipe(z.object({ barcode: z.string().trim().regex(/^\d{8,14}$/, '8 to 14 digits') }))) q: { barcode: string }) {
    return this.products.lookup(user, q.barcode);
  }

  @Get('products/:id')
  @RequirePermission('item:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.products.get(user, id);
  }

  @Get('products/:id/price-log')
  @RequirePermission('item:view')
  priceLog(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.products.priceLog(user, id);
  }

  @Post('products')
  @RequirePermission('item:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: Meta, @Body(pipe(ProductCreateSchema)) body: ProductCreate) {
    return this.products.create(user, meta, body);
  }

  @Patch('products/:id')
  @RequirePermission('item:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: Meta, @Param('id', uuid) id: string, @Body(pipe(ProductUpdateSchema)) body: ProductUpdate) {
    return this.products.update(user, meta, id, body);
  }

  @Patch('products/:id/price')
  @RequirePermission('item:edit')
  setPrice(@CurrentUser() user: SessionUser, @ReqMeta() meta: Meta, @Param('id', uuid) id: string, @Body(pipe(ProductPriceSchema)) body: ProductPriceChange) {
    return this.products.setPrice(user, meta, id, body);
  }

  @Post('products/:id/units')
  @RequirePermission('item:edit')
  addUnit(@CurrentUser() user: SessionUser, @ReqMeta() meta: Meta, @Param('id', uuid) id: string, @Body(pipe(ProductUnitCreateSchema)) body: ProductUnitCreate) {
    return this.products.addUnit(user, meta, id, body);
  }

  @Post('products/:id/barcodes')
  @RequirePermission('item:edit')
  addBarcode(@CurrentUser() user: SessionUser, @ReqMeta() meta: Meta, @Param('id', uuid) id: string, @Body(pipe(ProductBarcodeCreateSchema)) body: ProductBarcodeCreate) {
    return this.products.addBarcode(user, meta, id, body);
  }

  @Post('products/:id/suppliers')
  @RequirePermission('item:edit')
  addSupplier(@CurrentUser() user: SessionUser, @ReqMeta() meta: Meta, @Param('id', uuid) id: string, @Body(pipe(ProductSupplierCreateSchema)) body: ProductSupplierCreate) {
    return this.products.addSupplier(user, meta, id, body);
  }

  @Post('products/:id/:action')
  @HttpCode(200)
  @RequirePermission('item:edit')
  setActive(@CurrentUser() user: SessionUser, @ReqMeta() meta: Meta, @Param('id', uuid) id: string, @Param('action', pipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.products.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete('products/:id')
  @HttpCode(204)
  @RequirePermission('item:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: Meta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.products.delete(user, meta, id, q.rowVersion);
  }

  @Patch('product-units/:id')
  @RequirePermission('item:edit')
  updateUnit(@CurrentUser() user: SessionUser, @ReqMeta() meta: Meta, @Param('id', uuid) id: string, @Body(pipe(ProductUnitUpdateSchema)) body: ProductUnitUpdate) {
    return this.products.updateUnit(user, meta, id, body);
  }

  @Delete('product-units/:id')
  @HttpCode(204)
  @RequirePermission('item:edit')
  async deleteUnit(@CurrentUser() user: SessionUser, @ReqMeta() meta: Meta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.products.deleteUnit(user, meta, id, q.rowVersion);
  }

  @Patch('product-barcodes/:id')
  @RequirePermission('item:edit')
  updateBarcode(@CurrentUser() user: SessionUser, @ReqMeta() meta: Meta, @Param('id', uuid) id: string, @Body(pipe(ProductBarcodeUpdateSchema)) body: ProductBarcodeUpdate) {
    return this.products.updateBarcode(user, meta, id, body);
  }

  @Delete('product-barcodes/:id')
  @HttpCode(204)
  @RequirePermission('item:edit')
  async deleteBarcode(@CurrentUser() user: SessionUser, @ReqMeta() meta: Meta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.products.deleteBarcode(user, meta, id, q.rowVersion);
  }

  @Patch('product-suppliers/:id')
  @RequirePermission('item:edit')
  updateSupplier(@CurrentUser() user: SessionUser, @ReqMeta() meta: Meta, @Param('id', uuid) id: string, @Body(pipe(ProductSupplierUpdateSchema)) body: ProductSupplierUpdate) {
    return this.products.updateSupplier(user, meta, id, body);
  }

  @Delete('product-suppliers/:id')
  @HttpCode(204)
  @RequirePermission('item:edit')
  async deleteSupplier(@CurrentUser() user: SessionUser, @ReqMeta() meta: Meta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.products.deleteSupplier(user, meta, id, q.rowVersion);
  }
}
