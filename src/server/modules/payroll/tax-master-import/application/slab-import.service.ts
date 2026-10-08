import { Injectable } from '@nestjs/common';
import { masterTaxYearOf, type SessionUser, type TaxYear } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError } from '../../../../core/domain/errors.js';
import { TaxSlabStore } from '../../pay-groups/application/pay-group-store.js';

/** Port: the Tax Master's section 149 slabs (Platform.TaxMasterSalarySlabs) and the company's links to them. */
export abstract class MasterSlabSource {
  abstract slabs(taxYear: number): Promise<{ id: string; slabNo: number; incomeFrom: number; incomeTo: number | null; fixedTax: number; ratePct: number }[]>;
  /** Does the company's payroll year carry slabs imported from the master (sourceMasterId set)? */
  abstract linked(tenantId: string, payrollYear: string): Promise<boolean>;
}

/**
 * Payroll › Tax slabs › "Import from Tax Master" (Phase 37): copies the master slabs of a tax year into the company,
 * each linked to its master row (sourceMasterId). A year already imported → 409; a year entered by hand is replaced.
 * Master tax year 2027 = payroll year "2026-27".
 */
@Injectable()
export class SlabImportService {
  constructor(
    private readonly master: MasterSlabSource,
    private readonly slabs: TaxSlabStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async importMaster(user: SessionUser, meta: RequestMeta, year: string): Promise<TaxYear> {
    const master = await this.master.slabs(masterTaxYearOf(year));
    if (!master.length) throw new ConflictError(`The Tax Master has no salary slabs for ${year} yet.`, undefined, { code: 'TAX_MASTER_NOT_PUBLISHED' });
    if (await this.master.linked(user.tenantId, year)) {
      throw new ConflictError(`${year} slabs are already imported from the Tax Master.`, { taxYear: ['Already imported'] }, { code: 'TAX_MASTER_ALREADY_IMPORTED' });
    }
    const existing = (await this.slabs.years(user.tenantId)).find((y) => y.taxYear === year)?.slabs ?? [];
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.slabs.remove(user.tenantId, existing.map((s) => s.id));
      for (const s of master) {
        await this.slabs.save({ taxYear: year, slabNo: s.slabNo, incomeFrom: s.incomeFrom, incomeTo: s.incomeTo, fixedTax: s.fixedTax, ratePercent: s.ratePct, sourceMasterId: s.id });
      }
    });
    return (await this.slabs.years(user.tenantId)).find((y) => y.taxYear === year)!;
  }
}
