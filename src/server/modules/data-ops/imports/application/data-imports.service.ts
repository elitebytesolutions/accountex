import { Injectable } from '@nestjs/common';
import {
  CustomerCreateSchema, IMPORT_ENTITIES, ProductCreateSchema, VendorCreateSchema, type DataImport, type ImportEntity, type ImportError, type ImportStart, type SessionUser,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, DomainError, ForbiddenError, NotFoundError } from '../../../../core/domain/errors.js';
import { ProductsService } from '../../../inventory/products/application/products.service.js';
import { CustomersService } from '../../../parties/customers/application/customers.service.js';
import { VendorsService } from '../../../parties/vendors/application/vendors.service.js';
import { DataOpsStore } from '../../common/application/data-ops-store.js';

type Row = Record<string, string>;
const blank = (v: string | undefined) => (v === undefined || v.trim() === '' ? undefined : v.trim());
const numOr = (v: string | undefined) => (blank(v) === undefined ? undefined : Number(String(v).replace(/,/g, '')));

/**
 * Data imports: the wizard uploads the mapped rows (customers, vendors, items); validate checks each row against the
 * master's own create schema (plus unit codes and duplicates inside the file) and records the errors; run sends every
 * valid row through the master's create use case — same validation, numbering and row history as the screen — and
 * skips the rest. Rows are created, never updated.
 */
@Injectable()
export class DataImportsService {
  constructor(
    private readonly store: DataOpsStore,
    private readonly customers: CustomersService,
    private readonly vendors: VendorsService,
    private readonly products: ProductsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.listImports(user.tenantId);
  }

  async get(user: SessionUser, id: string): Promise<DataImport> {
    const j = await this.store.getImport(user.tenantId, id, true);
    if (!j) throw new NotFoundError('Import not found');
    return j;
  }

  async start(user: SessionUser, meta: RequestMeta, input: ImportStart) {
    this.assertCan(user, input.entity);
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => this.store.createImport(user.tenantId, {
      jobNo: await this.store.nextImportNo(), entity: input.entity, fileName: input.fileName, fileSizeBytes: BigInt(Number(input.fileSizeBytes)), sourceSystem: input.sourceSystem ?? 'EXCEL',
      totalRows: Number(input.totalRows), columnMap: input.columnMap, status: 'MAPPED', startedByUserId: user.id,
    }));
    return this.get(user, id);
  }

  /** Checks every row; replaces the job's errors; VALIDATED with the error count. */
  async validate(user: SessionUser, meta: RequestMeta, id: string, rows: Row[]) {
    const job = await this.open(user, id);
    const { errors } = await this.check(user, job.entity as ImportEntity, rows);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.replaceImportErrors(user.tenantId, id, errors);
      await this.store.updateImport(user.tenantId, id, { status: 'VALIDATED', errorCount: new Set(errors.map((e) => e.rowNo)).size, totalRows: rows.length });
    });
    return this.get(user, id);
  }

  /** Creates every valid row through the master's use case (each in its own transaction); failures are skipped and recorded. */
  async run(user: SessionUser, meta: RequestMeta, id: string, rows: Row[], skipErrorRows: boolean) {
    const job = await this.open(user, id);
    if (job.status !== 'VALIDATED') throw new ConflictError('Validate the file before importing it.', undefined, { code: 'IMPORT_NOT_VALIDATED' });
    const entity = job.entity as ImportEntity;
    const { errors, inputs } = await this.check(user, entity, rows);
    const bad = new Set(errors.map((e) => e.rowNo));
    if (bad.size && !skipErrorRows) throw new ConflictError('Fix the rows with errors, or choose to skip them.', undefined, { code: 'IMPORT_HAS_ERRORS' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.updateImport(user.tenantId, id, { status: 'IMPORTING', skipErrorRows, startedAt: new Date(), startedByUserId: user.id }));
    let created = 0;
    const failed: ImportError[] = [];
    for (const [rowNo, input] of inputs) {
      if (bad.has(rowNo)) continue;
      try {
        if (entity === 'CUSTOMERS') await this.customers.create(user, meta, input as never);
        else if (entity === 'VENDORS') await this.vendors.create(user, meta, input as never);
        else await this.products.create(user, meta, input as never);
        created++;
      } catch (e) {
        const msg = e instanceof DomainError ? e.message : (e as { meta?: { driverAdapterError?: { cause?: { originalMessage?: string } } } })?.meta?.driverAdapterError?.cause?.originalMessage ?? (e instanceof Error ? e.message : 'Failed');
        failed.push({ rowNo, fieldKey: null, badValue: null, message: msg });
      }
    }
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.addImportErrors(user.tenantId, id, failed);
      await this.store.updateImport(user.tenantId, id, {
        status: 'COMPLETED', finishedAt: new Date(), rowsCreated: created, rowsUpdated: 0, rowsSkipped: rows.length - created, errorCount: bad.size + failed.length,
      });
    });
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string) {
    await this.open(user, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.updateImport(user.tenantId, id, { status: 'CANCELLED' }));
    return this.get(user, id);
  }

  /** CSV of the job's errors (Row, Field, Value, Error). */
  async errorsCsv(user: SessionUser, id: string) {
    const j = await this.get(user, id);
    const q = (s: string | number | null) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const lines = [['Row', 'Field', 'Value', 'Error'].join(','), ...(j.errors ?? []).map((e) => [e.rowNo, e.fieldKey, e.badValue, e.message].map(q).join(','))];
    return { fileName: `${j.jobNo}-errors.csv`, csv: `﻿${lines.join('\r\n')}` };
  }

  // ---------------------------------------------------------------- helpers
  private assertCan(user: SessionUser, entity: ImportEntity) {
    const perm = IMPORT_ENTITIES[entity].permission;
    if (!user.permissions.includes(perm)) throw new ForbiddenError(`You need ${perm} to import ${IMPORT_ENTITIES[entity].label.toLowerCase()}.`, undefined, { code: 'PERMISSION_DENIED' });
  }

  private async open(user: SessionUser, id: string) {
    const j = await this.store.getImport(user.tenantId, id, false);
    if (!j) throw new NotFoundError('Import not found');
    if (['COMPLETED', 'CANCELLED', 'FAILED', 'IMPORTING'].includes(j.status)) throw new ConflictError('This import is already finished or cancelled.', undefined, { code: 'IMPORT_NOT_OPEN' });
    this.assertCan(user, j.entity as ImportEntity);
    return j;
  }

  /** Each row → the master's create input, validated by its own schema; duplicates inside the file and unknown units flagged. */
  private async check(user: SessionUser, entity: ImportEntity, rows: Row[]) {
    const errors: ImportError[] = [];
    const inputs = new Map<number, unknown>();
    const units = entity === 'ITEMS' ? await this.store.unitIds(user.tenantId) : new Map<string, string>();
    const seen = new Map<string, number>();
    rows.forEach((r, i) => {
      const rowNo = i + 1;
      for (const f of IMPORT_ENTITIES[entity].fields) if (f.required && !blank(r[f.key])) errors.push({ rowNo, fieldKey: f.key, badValue: null, message: `${f.label} is required` });
      const key = (entity === 'ITEMS' ? blank(r.sku) : blank(r.code) ?? blank(r.name))?.toUpperCase();
      if (key) {
        if (seen.has(key)) errors.push({ rowNo, fieldKey: entity === 'ITEMS' ? 'sku' : 'code', badValue: key, message: `Same as row ${seen.get(key)}` });
        else seen.set(key, rowNo);
      }
      let raw: Record<string, unknown>;
      if (entity === 'CUSTOMERS') {
        raw = { name: blank(r.name), code: blank(r.code), city: blank(r.city), billingAddress: blank(r.billingAddress), ntn: blank(r.ntn), strn: blank(r.strn), cnic: blank(r.cnic), mobile: blank(r.mobile), email: blank(r.email), creditLimit: numOr(r.creditLimit), customerType: 'COMPANY' };
      } else if (entity === 'VENDORS') {
        const atl = blank(r.atlStatus)?.toUpperCase();
        raw = { name: blank(r.name), code: blank(r.code), city: blank(r.city), address: blank(r.address), ntn: blank(r.ntn), strn: blank(r.strn), phone: blank(r.mobile), email: blank(r.email), ...(atl && { atlStatus: atl }) };
      } else {
        const uom = units.get(blank(r.unit)?.toUpperCase() ?? '');
        if (blank(r.unit) && !uom) errors.push({ rowNo, fieldKey: 'unit', badValue: blank(r.unit) ?? null, message: 'No unit with this code (Inventory › Units)' });
        raw = { sku: blank(r.sku), name: blank(r.name), uomId: uom ?? '00000000-0000-0000-0000-000000000000', upc: blank(r.upc), ctn: numOr(r.ctn), cost: numOr(r.cost), price: numOr(r.price), gstRate: numOr(r.gstRate), status: 'DRAFT' };
      }
      raw = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined));
      const schema = entity === 'CUSTOMERS' ? CustomerCreateSchema : entity === 'VENDORS' ? VendorCreateSchema : ProductCreateSchema;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        for (const iss of parsed.error.issues) {
          const field = String(iss.path[0] ?? '');
          const fk = field === 'uomId' ? 'unit' : field === 'phone' && entity === 'VENDORS' ? 'mobile' : field;
          // one message per cell: a required / unknown-unit error already said it
          if (fk && errors.some((e) => e.rowNo === rowNo && e.fieldKey === fk)) continue;
          const message = iss.code === 'invalid_type' && iss.expected === 'number' ? 'Enter a number' : iss.message;
          errors.push({ rowNo, fieldKey: fk || null, badValue: fk ? (r[fk] ?? null) : null, message });
        }
      } else inputs.set(rowNo, parsed.data);
    });
    return { errors, inputs };
  }
}
