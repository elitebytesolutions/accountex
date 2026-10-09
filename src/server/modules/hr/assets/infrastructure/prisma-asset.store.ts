import { Injectable } from '@nestjs/common';
import type { EmployeeAssetItem } from '../../../../../shared/index.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, employeeRefs, ids, num } from '../../attendance/infrastructure/hr-refs.js';
import { EmployeeAssetStore } from '../application/asset-store.js';

@Injectable()
export class PrismaEmployeeAssetStore extends EmployeeAssetStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db() {
    return this.prisma.db();
  }

  employee(tenantId: string, id: string) {
    return this.db().employees.findFirst({ where: { tenantId, id, deletedAt: null }, select: { id: true, status: true } });
  }

  private async items(tenantId: string, where: { employeeId?: string; id?: string }): Promise<(EmployeeAssetItem & { employeeId: string })[]> {
    const db = this.db();
    const rows = await db.employeeAssets.findMany({ where: { tenantId, ...where }, orderBy: [{ status: 'asc' }, { issuedOn: 'desc' }], take: 200 });
    const [fas, items] = await Promise.all([
      db.fixedAssets.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.assetId)) } }, select: { id: true, code: true } }),
      db.clearanceItems.findMany({ where: { tenantId, employeeAssetId: { in: rows.map((r) => r.id) } }, orderBy: { createdAt: 'desc' }, select: { employeeAssetId: true, offboardingId: true, status: true } }),
    ]);
    return rows.map((r) => {
      const c = items.find((i) => i.employeeAssetId === r.id);
      return {
        id: r.id, employeeId: r.employeeId, category: r.category, assetName: r.assetName, specification: r.specification, tag: r.tag, serialNo: r.serialNo,
        fixedAsset: r.assetId ? fas.find((f) => f.id === r.assetId) ?? { id: r.assetId, code: '?' } : null, issuedOn: day(r.issuedOn)!, returnedOn: day(r.returnedOn),
        condition: r.condition, valueAmount: r.valueAmount ? num(r.valueAmount) : null, status: r.status, remarks: r.remarks,
        clearance: c ? { offboardingId: c.offboardingId, status: c.status } : null, rowVersion: r.rowVersion,
      };
    });
  }

  list(tenantId: string, employeeId: string) {
    return this.items(tenantId, { employeeId });
  }

  async get(tenantId: string, id: string) {
    return (await this.items(tenantId, { id }))[0] ?? null;
  }

  async options(tenantId: string) {
    const db = this.db();
    const [fas, issued] = await Promise.all([
      db.fixedAssets.findMany({ where: { tenantId, deletedAt: null, disposedOn: null }, orderBy: { code: 'asc' }, take: 500, select: { id: true, code: true, name: true, serialNo: true, cost: true } }),
      db.employeeAssets.findMany({ where: { tenantId, status: 'ISSUED', assetId: { not: null } }, select: { assetId: true, employeeId: true } }),
    ]);
    const refs = await employeeRefs(db, tenantId, issued.map((i) => i.employeeId));
    return {
      fixedAssets: fas.map((f) => {
        const h = issued.find((i) => i.assetId === f.id);
        return { id: f.id, code: f.code, name: f.name, serialNo: f.serialNo, cost: num(f.cost), issuedTo: h ? refs.get(h.employeeId)?.name ?? '?' : null };
      }),
    };
  }

  async issue(data: Record<string, unknown>) {
    const r = await this.db().$queryRaw<{ id: string }[]>`select "HumanResources"."employeeAssetIssue"(${JSON.stringify(data)}::jsonb)::text as id`;
    return r[0]!.id;
  }

  async return(id: string, returnedOn: string, condition: string, remarks: string | null) {
    await this.db().$queryRaw`select "HumanResources"."employeeAssetReturn"(${id}::uuid, ${returnedOn}::date, ${condition}, ${remarks})::text`;
  }
}
