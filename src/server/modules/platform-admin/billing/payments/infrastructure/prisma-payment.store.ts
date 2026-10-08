import { Injectable } from '@nestjs/common';
import type { PlatformPayment } from '../../../../../../shared/index.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { PaymentStore, type NewPayment } from '../application/payment-store.js';

type Row = {
  id: string; invoiceId: string; docNo: string | null; tenantId: string; paymentMethod: string; paymentRef: string | null; amount: number; status: string;
  failureMessage: string | null; attemptedAt: Date; paidAt: Date | null; refundedAmount: number; refundedAt: Date | null; recordedBy: string | null;
  createdAt: Date; rowVersion: number;
};
const SELECT = `
  select p.id, p."platformInvoiceId" as "invoiceId", i."docNo", p."tenantId", p."paymentMethod", p."paymentRef", p.amount::float8 as amount, p.status,
         p."failureMessage", p."attemptedAt", p."paidAt", p."refundedAmount"::float8 as "refundedAmount", p."refundedAt", s."fullName" as "recordedBy",
         p."createdAt", p."rowVersion"
    from "Platform"."PlatformPayments" p
    join "Platform"."PlatformInvoices" i on i.id = p."platformInvoiceId"
    left join "Platform"."PlatformStaff" s on s.id = p."recordedByStaffId"`;
const toPayment = (r: Row): PlatformPayment => ({
  ...r, attemptedAt: r.attemptedAt.toISOString(), paidAt: r.paidAt?.toISOString() ?? null, refundedAt: r.refundedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
});

@Injectable()
export class PrismaPaymentStore extends PaymentStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async forInvoice(invoiceId: string) {
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(`${SELECT} where p."platformInvoiceId" = $1::uuid order by p."attemptedAt" desc`, invoiceId);
    return rows.map(toPayment);
  }

  async get(id: string) {
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(`${SELECT} where p.id = $1::uuid`, id);
    return rows[0] ? toPayment(rows[0]) : null;
  }

  async insert(p: NewPayment) {
    const row = await this.prisma.db().platformPayments.create({
      data: {
        tenantId: p.tenantId, platformInvoiceId: p.invoiceId, paymentMethod: p.paymentMethod, paymentRef: p.paymentRef, amount: p.amount, status: p.status,
        paidAt: p.paidAt, failureMessage: p.failureMessage, failureCode: p.status === 'FAILED' ? 'MANUAL' : null, recordedByStaffId: p.staffId,
      },
      select: { id: true },
    });
    return row.id;
  }

  async refund(id: string, rowVersion: number, refundedAmount: number, status: string) {
    const { count } = await this.prisma.db().platformPayments.updateMany({
      where: { id, rowVersion }, data: { refundedAmount, status, refundedAt: new Date() },
    });
    return count === 1;
  }
}
