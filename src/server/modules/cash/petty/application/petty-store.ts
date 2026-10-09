import type { PettyReplenishment, PettyVoucher, PettyVoucherList } from '../../../../../shared/index.js';

export abstract class PettyStore {
  abstract vouchers(tenantId: string, q: { fund?: string; status?: string; search?: string; page: number; pageSize: number }): Promise<PettyVoucherList>;
  abstract voucher(tenantId: string, id: string): Promise<PettyVoucher | null>;
  abstract saveVoucher(data: Record<string, unknown>): Promise<string>;
  abstract voidVoucher(id: string, reason: string | null): Promise<void>;
  abstract replenishments(tenantId: string, fundId: string | null): Promise<PettyReplenishment[]>;
  abstract replenishment(tenantId: string, id: string): Promise<PettyReplenishment | null>;
  abstract saveReplenishment(data: Record<string, unknown>): Promise<string>;
  abstract postReplenishment(id: string): Promise<void>;
  abstract cancelReplenishment(id: string, reason: string | null): Promise<void>;
}
