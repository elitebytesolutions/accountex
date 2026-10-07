import type { LabelJob, LabelTemplate } from '../../../../../shared/index.js';

export abstract class LabelStore {
  abstract templates(tenantId: string): Promise<LabelTemplate[]>;
  abstract templateCodes(tenantId: string): Promise<string[]>;
  abstract jobs(tenantId: string, limit: number): Promise<LabelJob[]>;
  /** Barcode and price to print for each product (primary piece / carton barcode, else the UPC). */
  abstract printData(tenantId: string, itemIds: string[]): Promise<{ id: string; price: number; piece: string | null; carton: string | null }[]>;
  abstract saveTemplate(data: Record<string, unknown>): Promise<string>;
  abstract saveJob(data: Record<string, unknown>): Promise<string>;
  abstract templateInUse(id: string): Promise<boolean>;
  abstract deleteTemplate(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
