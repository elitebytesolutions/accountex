import type { TaxCode, TaxCodeRateSave } from '../../../../../shared/index.js';

export type TaxCodeData = {
  id?: string;
  rowVersion?: number;
  code?: string;
  description?: string;
  taxType?: string;
  appliesTo?: string;
  rateBasis?: string;
  salesTaxKind?: string | null;
  whtSection?: string | null;
  whtNature?: string | null;
  accountId?: string | null;
  inputAccountId?: string | null;
  fbrReference?: string | null;
  calcOnExclSalesTax?: boolean;
  checkAtl?: boolean;
  isActive?: boolean;
  rates?: TaxCodeRateSave[];
};

export abstract class TaxCodeStore {
  abstract list(tenantId: string): Promise<TaxCode[]>;
  abstract get(tenantId: string, id: string): Promise<TaxCode | null>;
  abstract retiredCodes(tenantId: string): Promise<string[]>;
  abstract save(data: TaxCodeData): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
