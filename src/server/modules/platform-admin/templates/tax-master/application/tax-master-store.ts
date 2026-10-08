import type { AdminHistoryPage, SalarySlab, SalesTaxRate, TaxAuthority, WithholdingRate } from '../../../../../../shared/index.js';
import type { Sealed } from '../../../../../core/application/ports/secret-box.js';

export type RateKind = 'sales-tax' | 'withholding';

/** Port: the tax master tables (Platform schema). Writes run inside a UnitOfWork. */
export abstract class TaxMasterStore {
  abstract authorities(): Promise<TaxAuthority[]>;
  abstract salesTax(): Promise<SalesTaxRate[]>;
  abstract withholding(): Promise<WithholdingRate[]>;
  abstract slabs(): Promise<SalarySlab[]>;
  /** Tenant payroll slabs linked to each master tax year (Payroll.SalaryTaxSlabs.sourceMasterId). */
  abstract slabImports(): Promise<Map<number, number>>;
  /** Platform.taxMaster*Schedule: closes the rate in force and inserts the new one. Returns the id. */
  abstract schedule(kind: RateKind, data: Record<string, unknown>): Promise<string>;
  /** Platform.taxMaster*RateAddUpdate (partial update with rowVersion). */
  abstract saveRate(kind: RateKind, data: Record<string, unknown>): Promise<string>;
  abstract deleteRate(kind: RateKind, id: string, rowVersion: number): Promise<void>;
  abstract saveAuthority(data: Record<string, unknown>): Promise<string>;
  /** The authority's sealed API token, for the connection test only. */
  abstract authorityToken(id: string): Promise<Sealed | null>;
  /** Replaces a tax year's slabs (delete + Platform.taxMasterSalarySlabAddUpdate per slab). */
  abstract replaceSlabs(taxYear: number, slabs: Record<string, unknown>[]): Promise<void>;
  /** Platform history of every tax-master table, newest first (the Change log tab). */
  abstract log(limit: number, offset: number): Promise<AdminHistoryPage>;
}

export type ConnectionProbe = { ok: boolean; ms: number; httpStatus: number | null; message: string };

/** Port: reaches a tax authority's endpoint (FBR / PRAL digital invoicing, provincial e-invoicing). */
export abstract class TaxAuthorityGateway {
  abstract probe(input: { endpoint: string; token: string | null; posId: string | null; timeoutMs: number }): Promise<ConnectionProbe>;
}
